from datetime import datetime, timezone, timedelta

import discord
from discord import app_commands
from discord.ext import commands

from .storage import (
    active_session_autocomplete,
    update_session,
    get_session,
    clear_all_sessions, 
    create_session, 
    get_all_sessions, 
    set_message_ref,
    )
from .templates import RAID_TEMPLATES
from .views import build_raid_text, build_raid_view, _parse_raid_datetime

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Hour choices: 00 – 23
_HOUR_CHOICES = [
    app_commands.Choice(name=f"{h:02d}:--", value=h)
    for h in range(24)
]

# Minute choices: multiples of 10
_MINUTE_CHOICES = [
    app_commands.Choice(name=f"--:{m:02d}", value=m)
    for m in range(0, 60, 10)
]



def _build_date_time(hour: int, minute: int) -> str:
    """Return a date+time string in GMT+7 format for storage.

    If the chosen hour:minute has already passed today (GMT+7), tomorrow's
    date is used automatically.
    """
    now_utc = datetime.now(timezone.utc)
    gmt7    = now_utc + timedelta(hours=7)
    target  = gmt7.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if target < gmt7:
        target += timedelta(days=1)

    return f"{target.day} {_MONTHS[target.month - 1]} {target.year} | {hour:02d}:{minute:02d} GMT+7"


def setup_commands(bot: commands.Bot) -> None:
    """Register all slash commands onto bot.tree."""

    # ── /raid-open ────────────────────────────────────────────────────────────
    @bot.tree.command(name="raid-open", description="Open a new raid session")
    @app_commands.describe(
        raid_type="Raid type to open",
        hour="Raid start hour (GMT+7, 24-hour)",
        minute="Raid start minute (multiples of 10)",
    )
    @app_commands.choices(
        raid_type=[
            app_commands.Choice(name="Boma Dungeon",            value="boma"),
            app_commands.Choice(name="Samael Fortress Madness", value="samael"),
            app_commands.Choice(name="The Wandering Troupe",    value="wandering"),
        ],
        hour=_HOUR_CHOICES,
        minute=_MINUTE_CHOICES,
    )
    
    async def raid_open(
        interaction: discord.Interaction,
        raid_type: str,
        hour: int,
        minute: int,
    ) -> None:
        """Create a new raid session. Date is today or tomorrow based on the chosen time."""
        if interaction.guild is None:
            await interaction.response.send_message(
                "❌ This command can only be used inside a server.", ephemeral=True,
            )
            return
        date_time = _build_date_time(hour, minute)
        session   = create_session(raid_type, date_time, str(interaction.user.id), interaction.guild.id, interaction.channel.id)
        
        if not session:
            await interaction.response.send_message("❌ Invalid raid type.", ephemeral=True)
            return

        text = build_raid_text(interaction.guild,session)
        view = build_raid_view(session)

        await interaction.response.send_message(text, view=view,
            allowed_mentions=discord.AllowedMentions(roles=True))
        msg = await interaction.original_response()
        set_message_ref(session["id"], str(msg.id), str(interaction.channel_id))
        
    # ── /edit_time ───────────────────────────────────────

    @bot.tree.command(
        name="edit_time",
        description="Edit the time of an active raid session"
    )
    @app_commands.describe(
        session_id="The session ID you want to change",
        hour="Raid start hour (GMT+7, 24-hour)",
        minute="Raid start minute (multiples of 10)",
    )
    @app_commands.autocomplete(
        session_id=active_session_autocomplete, 
    )
    @app_commands.choices(
        hour=_HOUR_CHOICES,
        minute=_MINUTE_CHOICES,
    )
    async def edit_time(
        interaction: discord.Interaction,
        session_id: str,
        hour: int,
        minute: int,
    ) -> None:
        date_time = _build_date_time(hour, minute)
        session = get_session(session_id)
        if not session:
            await interaction.response.send_message("❌ Session not found.", ephemeral=True)
            return

        if session["created_by"] != str(interaction.user.id):
            await interaction.response.send_message(
                "❌ Only the session creator can edit its time.", ephemeral=True,
            )
            return

        if session["status"] == "done":
            await interaction.response.send_message(
                "❌ This session is already marked as done and cannot be edited.", ephemeral=True,
            )
            return

        raid_dt = _parse_raid_datetime(session["date_time"])
        if raid_dt:
            now_utc = datetime.now(timezone.utc)
            if raid_dt.astimezone(timezone.utc) <= now_utc:
                await interaction.response.send_message(
                    "❌ This raid has already started and cannot be edited.", ephemeral=True,
                )
                return
        
        session["date_time"] = date_time
        
        raid_dt=_parse_raid_datetime(date_time)
        if raid_dt:
            expires_at = (raid_dt.astimezone(timezone.utc) + timedelta(minutes=10)).isoformat()
        else:
            expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        
        session["expires_at"] = expires_at
        text = build_raid_text(interaction.guild, session)
        view = build_raid_view(session)

        channel_id = session.get("channel_id")
        message_id = session.get("message_id")
        if not channel_id or not message_id:
            await interaction.response.send_message(
                "❌ Original raid message was not found for this session.",
                ephemeral=True,
            )
            return

        try:
            channel = interaction.client.get_channel(int(channel_id))
            if channel is None:
                channel = await interaction.client.fetch_channel(int(channel_id))
            message = await channel.fetch_message(int(message_id))
            await message.edit(
                content=text,
                view=view,
                allowed_mentions=discord.AllowedMentions(roles=True),
            )
        except discord.NotFound:
            await interaction.response.send_message(
                "❌ Original raid message was deleted or cannot be found.",
                ephemeral=True,
            )
            return
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ I do not have permission to edit the original raid message.",
                ephemeral=True,
            )
            return
        except discord.HTTPException:
            await interaction.response.send_message(
                "❌ Failed to edit the original raid message. Please try again.",
                ephemeral=True,
            )
            return

        update_session(
            session_id,
            date_time=date_time,
            expires_at=expires_at
        )

        await interaction.response.send_message(
            f"✅ Raid time for **{session['template_name']}** (by <@{session['created_by']}>) has been updated to **{date_time}**."
        )

    # ── /raid-list ────────────────────────────────────────────────────────────
    @bot.tree.command(name="raid-list", description="Refresh and show all active raid sessions sorted by time")
    async def raid_list(interaction: discord.Interaction) -> None:
        """Delete old raid messages, then repost all active sessions sorted by time."""
        sessions = get_all_sessions(interaction.guild.id)
        sessions.sort(
            key=lambda s: _parse_raid_datetime(s["date_time"]) or datetime.min.replace(tzinfo=timezone.utc)
        )

        if not sessions:
            await interaction.response.send_message("📭 No active raid sessions found.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)

        # Delete old message then repost immediately per session
        # so if bot crashes mid-way, already-reposted sessions survive
        for session in sessions:
            channel_id = session.get("channel_id")
            message_id = session.get("message_id")
            if channel_id and message_id:
                try:
                    channel = interaction.client.get_channel(int(channel_id))
                    if channel is None:
                        channel = await interaction.client.fetch_channel(int(channel_id))
                    msg = await channel.fetch_message(int(message_id))
                    await msg.delete()
                except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                    pass

            text = build_raid_text(interaction.guild, session)
            view = build_raid_view(session)
            msg = await interaction.channel.send(
                content=text,
                view=view,
                allowed_mentions=discord.AllowedMentions(roles=True),
            )
            set_message_ref(session["id"], str(msg.id), str(interaction.channel_id))

        total = len(sessions)
        await interaction.edit_original_response(
            content=f"✅ Refreshed **{total}** raid session(s), sorted by time."
        )

    # ── /raid-help ────────────────────────────────────────────────────────────
    @bot.tree.command(name="raid-help", description="Show Raid Bot usage guide")
    async def raid_help(interaction: discord.Interaction) -> None:
        """Send the usage guide (only visible to the requesting user)."""
        template_list = "\n".join(
            f"**{t.name}** — {len(t.slots)} slots"
            for t in RAID_TEMPLATES.values()
        )
        text = "\n".join([
            "⚔️ **Raid Bot — Help**",
            "",
            "**Commands:**",
            "`/raid-open`  — Create a new raid session with Join/Leave buttons",
            "`/edit_time`  — Edit the time of your active raid session",
            "`/raid-list`  — Delete old messages & repost all active sessions sorted by time",
            "`/raid-help`  — Show this guide",
            "",
            "**Available Raid Types:**",
            template_list,
            "",
            "**How to use:**",
            "1. Use `/raid-open` → choose raid type, hour and minute (GMT+7)",
            "   → If the time has already passed today, tomorrow's date is used automatically",
            "2. Click **Join** to register for a slot",
            "3. Click **Leave** to unregister from a slot",
            "4. Click **Done** when the dungeon is complete",
            "5. Only the session creator can press **Done** or **Delete**",
        ])
        await interaction.response.send_message(text, ephemeral=True)

    # ── /clear-all (server owner only) ───────────────────────────────────────
    @bot.tree.command(name="clear-all", description="Delete all raid sessions (server owner only)")
    async def clear_all(interaction: discord.Interaction) -> None:
        """Wipe every session from the database. Restricted to the Discord server owner."""
        if interaction.guild is None:
            await interaction.response.send_message(
                "❌ This command can only be used inside a server.", ephemeral=True
            )
            return

        if interaction.user.id != interaction.guild.owner_id:
            await interaction.response.send_message(
                "❌ Only the server owner can use this command.", ephemeral=True
            )
            return

        total = clear_all_sessions()
        await interaction.response.send_message(
            f"🗑️ **{total} session(s) deleted.**",
            ephemeral=True,
        )


# ── /Test (server owner only) ───────────────────────────────────────
