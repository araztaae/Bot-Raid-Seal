import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

import { createSession, getAllSessions, setMessageRef } from "./storage.js";
import { buildRaidText, buildRaidComponents } from "./embed.js";
import { RAID_TEMPLATES } from "./templates.js";

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

export const commands: { data: SlashCommandBuilder; execute: CommandHandler }[] = [
  {
    data: new SlashCommandBuilder()
      .setName("raid-open")
      .setDescription("Buka sesi raid baru")
      .addStringOption((opt) =>
        opt
          .setName("tipe")
          .setDescription("Tipe raid yang akan dibuka")
          .setRequired(true)
          .addChoices(
            { name: "Boma Dungeon", value: "boma" },
            { name: "Samael Fortress Madness", value: "samael" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("waktu")
          .setDescription("Tanggal dan waktu raid, contoh: 10 Mei 2026 | 20:00 WIB")
          .setRequired(true)
      ) as SlashCommandBuilder,

    execute: async (interaction) => {
      const tipe = interaction.options.getString("tipe", true);
      const waktu = interaction.options.getString("waktu", true);

      const session = createSession(tipe, waktu, interaction.user.id);
      if (!session) {
        await interaction.reply({ content: "❌ Tipe raid tidak valid.", ephemeral: true });
        return;
      }

      const text = buildRaidText(session);
      const components = buildRaidComponents(session);

      const reply = await interaction.reply({ content: text, components, fetchReply: true });
      setMessageRef(session.id, reply.id, interaction.channelId);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("raid-list")
      .setDescription("Tampilkan semua sesi raid aktif beserta tombol join") as SlashCommandBuilder,

    execute: async (interaction) => {
      const all = getAllSessions();

      if (all.length === 0) {
        await interaction.reply({ content: "📭 Belum ada sesi raid yang dibuat." });
        return;
      }

      await interaction.deferReply();

      const sessions = all.slice(0, 5);

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i]!;
        const text = buildRaidText(session);
        const components = buildRaidComponents(session);

        if (i === 0) {
          await interaction.editReply({ content: text, components });
        } else {
          await interaction.followUp({ content: text, components });
        }
      }

      if (all.length > 5) {
        await interaction.followUp({
          content: `> ℹ️ Menampilkan 5 dari **${all.length}** sesi aktif.`,
        });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("raid-help")
      .setDescription("Tampilkan bantuan penggunaan Raid List Bot") as SlashCommandBuilder,

    execute: async (interaction) => {
      const templateList = Object.entries(RAID_TEMPLATES)
        .map(([, t]) => `**${t.name}** — ${t.slots.length} slot`)
        .join("\n");

      const text = [
        "⚔️ **Raid List Bot — Bantuan**",
        "",
        "**Perintah:**",
        "`/raid-open` — Buka sesi raid baru",
        "`/raid-list` — Tampilkan semua sesi aktif",
        "`/raid-help` — Tampilkan bantuan ini",
        "",
        "**Tipe Raid:**",
        templateList,
        "",
        "**Cara Pakai:**",
        "1. Gunakan `/raid-open` untuk membuat sesi",
        "2. Klik tombol **Join** untuk daftar ke slot",
        "3. Klik tombol **Leave** untuk keluar dari slot",
        "4. Hanya pembuat sesi yang bisa menghapus",
      ].join("\n");

      await interaction.reply({ content: text, ephemeral: true });
    },
  },
];
