import asyncio
import logging
import os

import discord
from discord import app_commands
from aiohttp import web
from discord.ext import commands, tasks

from bot.commands import setup_commands
from bot.db import init_db
from bot.storage import (
    cleanup_expired_sessions,
    check_raid_reminders,
    claim_slot,
    delete_session,
    get_session,
    load_counter,
    mark_session_done,
    release_slot,
)
from bot.views import build_raid_text, build_raid_view

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("raid-bot")


def _load_dotenv(path: str = ".env") -> None:
    """Load KEY=VALUE pairs from .env without overriding real environment variables."""
    if not os.path.exists(path):
        return

    with open(path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

# ── Configuration ─────────────────────────────────────────────────────────────
_load_dotenv()
TOKEN    = os.environ["DISCORD_BOT_TOKEN"]
GUILD_ID = os.environ.get("DISCORD_GUILD_ID")
PORT     = int(os.environ.get("PORT", 3000))

# ── Bot setup ─────────────────────────────────────────────────────────────────
intents = discord.Intents.default()
bot     = commands.Bot(command_prefix="!", intents=intents)


@tasks.loop(minutes=1)
async def _auto_cleanup() -> None:
    """Background task: delete expired sessions every minute."""
    try:
        await cleanup_expired_sessions(bot)
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
    try:
        await check_raid_reminders(bot)
    except Exception as e:
        logger.error(f"Reminder failed: {e}")


@bot.event
async def on_ready() -> None:
    """Called once when the bot successfully connects to Discord."""
    logger.info(f"Discord bot ready: {bot.user}")
    # Run cleanup here (bot is now connected) so expired session messages
    # can actually be deleted from Discord before the periodic task starts.
    try:
        removed = await cleanup_expired_sessions(bot)
        if removed:
            logger.info(f"on_ready cleanup: removed {removed} expired session(s)")
    except Exception as e:
        logger.error(f"on_ready cleanup failed: {e}")
    if not _auto_cleanup.is_running():
        _auto_cleanup.start()

    @bot.tree.error
    async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
        logger.error(f"Command error: {error}", exc_info=error)
        try:
            if interaction.response.is_done():
                await interaction.followup.send("❌ An error occurred. Please try again.", ephemeral=True)
            else:
                await interaction.response.send_message("❌ An error occurred. Please try again.", ephemeral=True)
        except Exception:
            pass

    if GUILD_ID:
        guild = discord.Object(id=int(GUILD_ID))

        # Copy commands to the guild first (while tree still has content)
        bot.tree.copy_global_to(guild=guild)

        # Clear and sync global tree → removes global commands from Discord
        bot.tree.clear_commands(guild=None)
        await bot.tree.sync(guild=None)

        # Sync guild commands → active immediately, no 1-hour propagation delay
        synced = await bot.tree.sync(guild=guild)
        logger.info(f"Synced {len(synced)} commands to guild {GUILD_ID}")
    else:
        synced = await bot.tree.sync()
        logger.info(f"Synced {len(synced)} commands globally")


@bot.event
async def on_interaction(interaction: discord.Interaction) -> None:
    """Handle all button/component interactions.

    custom_id format: "action:session_id[:slot_index]"
    Examples:
        "rjoin:3:2"  → join slot index 2 in session ID 3
        "rleave:3:2" → leave slot index 2 in session ID 3
        "rdone:3"    → mark session 3 as done
        "rdel:3"     → delete session 3
    """
    if interaction.type != discord.InteractionType.component:
        return

    custom_id: str = interaction.data.get("custom_id", "")
    parts  = custom_id.split(":")
    action = parts[0] if parts else ""

    # ── Delete session ────────────────────────────────────────────────────────
    if action == "rdel" and len(parts) >= 2:
        session = get_session(parts[1])
        if not session:
            await interaction.response.send_message("❌ Session not found.", ephemeral=True)
            return
        if session["created_by"] != str(interaction.user.id):
            await interaction.response.send_message(
                "❌ Only the session creator can delete it.", ephemeral=True
            )
            return
        delete_session(parts[1])
        await interaction.response.edit_message(
            content=f"🗑️ Raid session **{session['template_name']}** has been deleted.",
            view=None,
        )

    # ── Mark session as done ──────────────────────────────────────────────────
    elif action == "rdone" and len(parts) >= 2:
        session = get_session(parts[1])
        if not session:
            await interaction.response.send_message("❌ Session not found.", ephemeral=True)
            return
        if session["created_by"] != str(interaction.user.id):
            await interaction.response.send_message(
                "❌ Only the session creator can mark it as done.", ephemeral=True
            )
            return
        if session["status"] == "done":
            await interaction.response.send_message(
                "ℹ️ This session is already marked as done.", ephemeral=True
            )
            return
        mark_session_done(parts[1])
        session["status"] = "done"
        await interaction.response.edit_message(
            content=build_raid_text(interaction.guild,session), view=build_raid_view(session)
        )

    # ── Join slot ─────────────────────────────────────────────────────────────
    elif action == "rjoin" and len(parts) >= 3:
        result = claim_slot(
            parts[1], int(parts[2]),
            str(interaction.user.id), interaction.user.display_name,
        )
        if not result["success"]:
            await interaction.response.send_message(f"❌ {result['message']}", ephemeral=True)
            return
        session = result["session"]
        await interaction.response.edit_message(
            content=build_raid_text(interaction.guild,session), view=build_raid_view(session)
        )

    # ── Leave slot ────────────────────────────────────────────────────────────
    elif action == "rleave" and len(parts) >= 3:
        result = release_slot(parts[1], int(parts[2]), str(interaction.user.id))
        if not result["success"]:
            await interaction.response.send_message(f"❌ {result['message']}", ephemeral=True)
            return
        session = result["session"]
        await interaction.response.edit_message(
            content=build_raid_text(interaction.guild,session), view=build_raid_view(session)
                                   )

    # ── Disabled / unknown action — silently ignore ───────────────────────────
    else:
        try:
            await interaction.response.defer()
        except Exception:
            pass


async def _health_handler(request: web.Request) -> web.Response:
    """HTTP health-check endpoint."""
    return web.Response(text='{"status":"ok"}', content_type="application/json")


async def _start_web_server() -> None:
    """Start a lightweight HTTP server for health checks."""
    app = web.Application()
    app.router.add_get("/",        _health_handler)
    app.router.add_get("/healthz", _health_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"HTTP server listening on port {PORT}")


async def main() -> None:
    """Entry point: init DB → load counter → register commands → run."""
    init_db()
    load_counter()
    setup_commands(bot)
    await _start_web_server()
    await bot.start(TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
