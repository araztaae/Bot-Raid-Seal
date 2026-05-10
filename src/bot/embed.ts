import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} from "discord.js";
import type { RaidSession } from "./storage.js";

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━━━";

export function buildRaidText(session: RaidSession): string {
  const apostleSlots = session.slots.filter((s) => s.category === "apostle");
  const hitterSlots = session.slots.filter((s) => s.category === "hitter");
  const filled = session.slots.filter((s) => s.claimedBy !== null).length;
  const total = session.slots.length;

  let text = `**Date & Time :** ${session.dateTime}\n`;
  text += `${SEPARATOR}\n`;
  text += `**@${session.templateName}**\n`;

  for (const slot of apostleSlots) {
    const claimed = slot.claimedBy ? `**${slot.claimedUsername}**` : "[Unclaimed]";
    text += `🔮 **${slot.role}:** ${claimed}\n`;
  }

  if (hitterSlots.length > 0) {
    text += `⚔️ **Hitters:**\n`;
    for (let i = 0; i < hitterSlots.length; i++) {
      const slot = hitterSlots[i]!;
      const claimed = slot.claimedBy ? `**${slot.claimedUsername}**` : "[Unclaimed]";
      const connector = i === hitterSlots.length - 1 ? "┗" : "┣";
      text += `   ${connector} ⚔️ ${slot.role} = ${claimed}\n`;
    }
  }

  text += `> ${filled}/${total} slot terisi • ID: \`${session.id}\``;
  return text;
}

export function buildAllSessionsText(sessions: RaidSession[]): string {
  const lines: string[] = [];

  for (let s = 0; s < sessions.length; s++) {
    const session = sessions[s]!;
    const apostleSlots = session.slots.filter((sl) => sl.category === "apostle");
    const hitterSlots = session.slots.filter((sl) => sl.category === "hitter");
    const filled = session.slots.filter((sl) => sl.claimedBy !== null).length;
    const total = session.slots.length;

    if (s > 0) lines.push("");

    lines.push(`**Date & Time :** ${session.dateTime}`);
    lines.push(SEPARATOR);
    lines.push(`**@${session.templateName}** — ${filled}/${total} slot terisi`);
    lines.push("");

    for (const slot of apostleSlots) {
      const claimed = slot.claimedBy ? `**${slot.claimedUsername}**` : "[Unclaimed]";
      lines.push(`🔮 **${slot.role}:** ${claimed}`);
    }

    if (hitterSlots.length > 0) {
      lines.push(`⚔️ **Hitters:**`);
      for (let i = 0; i < hitterSlots.length; i++) {
        const slot = hitterSlots[i]!;
        const claimed = slot.claimedBy ? `**${slot.claimedUsername}**` : "[Unclaimed]";
        const connector = i === hitterSlots.length - 1 ? "┗" : "┣";
        lines.push(`   ${connector} ⚔️ ${slot.role} = ${claimed}`);
      }
    }
  }

  return lines.join("\n");
}

export function buildAllSessionsComponents(sessions: RaidSession[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (const session of sessions) {
    if (rows.length >= 4) break;

    const apostleSlots = session.slots
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) => slot.category === "apostle");

    const hitterSlots = session.slots
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) => slot.category === "hitter");

    function makeBtn(slot: RaidSession["slots"][number], idx: number) {
      if (slot.claimedBy) {
        return new ButtonBuilder()
          .setCustomId(`rleave:${session.id}:${idx}`)
          .setLabel(slot.role)
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🚪");
      }
      return new ButtonBuilder()
        .setCustomId(`rjoin:${session.id}:${idx}`)
        .setLabel(slot.role)
        .setStyle(slot.category === "apostle" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji(slot.category === "apostle" ? "🔮" : "⚔️");
    }

    const labelBtn = new ButtonBuilder()
      .setCustomId(`rlabel:${session.id}`)
      .setLabel(session.templateName.length > 20 ? session.templateName.slice(0, 18) + "…" : session.templateName)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const apostleButtons = apostleSlots.map(({ slot, i }) => makeBtn(slot, i));
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(labelBtn, ...apostleButtons);
    rows.push(row1);

    if (hitterSlots.length > 0 && rows.length < 4) {
      const hitterButtons = hitterSlots.slice(0, 5).map(({ slot, i }) => makeBtn(slot, i));
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(hitterButtons));
    }
  }

  return rows.map((r) => r.toJSON());
}

export function buildRaidEmbed(session: RaidSession): EmbedBuilder {
  const apostleSlots = session.slots.filter((s) => s.category === "apostle");
  const hitterSlots = session.slots.filter((s) => s.category === "hitter");

  let description = `**Date & Time :** ${session.dateTime}\n${SEPARATOR}\n`;
  description += `**@${session.templateName}**\n\n`;

  for (const slot of apostleSlots) {
    const claimed = slot.claimedBy ? `**${slot.claimedUsername}**` : "[Unclaimed]";
    description += `🔮 **${slot.role}:** ${claimed}\n`;
  }

  if (hitterSlots.length > 0) {
    description += `⚔️ **Hitters:**\n`;
    for (let i = 0; i < hitterSlots.length; i++) {
      const slot = hitterSlots[i]!;
      const claimed = slot.claimedBy ? `**${slot.claimedUsername}**` : "[Unclaimed]";
      const connector = i === hitterSlots.length - 1 ? "┗" : "┣";
      description += `   ${connector} ⚔️ ${slot.role} = ${claimed}\n`;
    }
  }

  const totalSlots = session.slots.length;
  const filledSlots = session.slots.filter((s) => s.claimedBy !== null).length;

  return new EmbedBuilder()
    .setColor(filledSlots === totalSlots ? Colors.Green : Colors.Orange)
    .setDescription(description)
    .setFooter({ text: `Sesi ID: ${session.id} • ${filledSlots}/${totalSlots} slot terisi` })
    .setTimestamp();
}

export function buildRaidComponents(session: RaidSession) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const apostleSlots = session.slots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot.category === "apostle");

  const hitterSlots = session.slots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot.category === "hitter");

  function makeBtn(slot: RaidSession["slots"][number], i: number) {
    if (slot.claimedBy) {
      return new ButtonBuilder()
        .setCustomId(`rleave:${session.id}:${i}`)
        .setLabel(slot.role)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚪");
    }
    return new ButtonBuilder()
      .setCustomId(`rjoin:${session.id}:${i}`)
      .setLabel(slot.role)
      .setStyle(slot.category === "apostle" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(slot.category === "apostle" ? "🔮" : "⚔️");
  }

  if (apostleSlots.length > 0) {
    const apostleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      apostleSlots.slice(0, 5).map(({ slot, i }) => makeBtn(slot, i))
    );
    rows.push(apostleRow);
  }

  for (let i = 0; i < hitterSlots.length && rows.length < 4; i += 5) {
    const chunk = hitterSlots.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        chunk.map(({ slot, i: slotIdx }) => makeBtn(slot, slotIdx))
      )
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rdel:${session.id}`)
        .setLabel("Hapus Sesi")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️")
    )
  );

  return rows.slice(0, 5).map((r) => r.toJSON());
}
