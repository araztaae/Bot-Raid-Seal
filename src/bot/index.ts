import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  ChatInputCommandInteraction,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { commands } from "./commands.js";
import {
  getSession,
  claimSlot,
  releaseSlot,
  deleteSession,
} from "./storage.js";
import { buildRaidText, buildRaidComponents } from "./embed.js";
import { logger } from "../lib/logger.js";

export async function startBot() {
  const token =
    process.env[
      MTUwMjk5NzQwMzc4MTgyNDU2Mw.GHEBuZ.L5OJ - kRM8mfCaKwS8ZkNvGaxcJTws9qZ9wUW38
    ];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set. Bot will not start.");
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");

    const rest = new REST().setToken(token);
    const commandsJson = commands.map((c) => c.data.toJSON());
    const guildId = process.env[1502999509247201290];

    try {
      if (guildId) {
        logger.info({ guildId }, "Registering slash commands to guild...");
        await rest.put(
          Routes.applicationGuildCommands(readyClient.user.id, guildId),
          {
            body: commandsJson,
          },
        );
        logger.info(
          { count: commandsJson.length, guildId },
          "Guild slash commands registered",
        );
      } else {
        logger.info("Registering slash commands globally...");
        await rest.put(Routes.applicationCommands(readyClient.user.id), {
          body: commandsJson,
        });
        logger.info(
          { count: commandsJson.length },
          "Global slash commands registered",
        );
      }
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = commands.find(
        (c) => c.data.name === interaction.commandName,
      );
      if (!command) {
        logger.warn(
          { name: interaction.commandName },
          "Unknown command received",
        );
        return;
      }
      try {
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (err) {
        logger.error(
          { err, command: interaction.commandName },
          "Error executing command",
        );
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "❌ Terjadi kesalahan saat menjalankan perintah.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ Terjadi kesalahan saat menjalankan perintah.",
            ephemeral: true,
          });
        }
      }
      return;
    }

    if (interaction.isButton()) {
      const [action, sessionId, slotIndexStr] = interaction.customId.split(":");

      if (!action || !sessionId) return;

      if (action === "rdel") {
        const session = getSession(sessionId);
        if (!session) {
          await interaction.reply({
            content: "❌ Sesi tidak ditemukan.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (session.createdBy !== interaction.user.id) {
          await interaction.reply({
            content: "❌ Hanya pembuat sesi yang bisa menghapus.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        deleteSession(sessionId);
        await interaction.update({
          content: `🗑️ Sesi raid **${session.templateName}** telah dihapus.`,
          embeds: [],
          components: [],
        });
        return;
      }

      if (action === "rjoin" && slotIndexStr !== undefined) {
        const slotIndex = parseInt(slotIndexStr, 10);
        const result = claimSlot(
          sessionId,
          slotIndex,
          interaction.user.id,
          interaction.user.username,
        );

        if (!result.success) {
          await interaction.reply({
            content: `❌ ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const session = getSession(sessionId);
        if (!session) return;

        const text = buildRaidText(session);
        const components = buildRaidComponents(session);
        await interaction.update({ content: text, embeds: [], components });
        return;
      }

      if (action === "rleave" && slotIndexStr !== undefined) {
        const slotIndex = parseInt(slotIndexStr, 10);
        const result = releaseSlot(sessionId, slotIndex, interaction.user.id);

        if (!result.success) {
          await interaction.reply({
            content: `❌ ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const session = getSession(sessionId);
        if (!session) return;

        const text = buildRaidText(session);
        const components = buildRaidComponents(session);
        await interaction.update({ content: text, embeds: [], components });
        return;
      }
    }
  });

  await client.login(token);
}
