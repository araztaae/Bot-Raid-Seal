import { RAID_TEMPLATES, type RaidTemplate } from "./templates.js";

export interface RaidSlot {
  role: string;
  category: "apostle" | "hitter";
  claimedBy: string | null;
  claimedUsername: string | null;
}

export interface RaidSession {
  id: string;
  templateKey: string;
  templateName: string;
  dateTime: string;
  createdBy: string;
  slots: RaidSlot[];
  messageId: string | null;
  channelId: string | null;
  createdAt: string;
}

let sessionCounter = 1;
const sessions: Map<string, RaidSession> = new Map();

export function createSession(
  templateKey: string,
  dateTime: string,
  createdBy: string
): RaidSession | null {
  const template: RaidTemplate | undefined = RAID_TEMPLATES[templateKey];
  if (!template) return null;

  const id = String(sessionCounter++);
  const session: RaidSession = {
    id,
    templateKey,
    templateName: template.name,
    dateTime,
    createdBy,
    slots: template.slots.map((s) => ({
      role: s.role,
      category: s.category,
      claimedBy: null,
      claimedUsername: null,
    })),
    messageId: null,
    channelId: null,
    createdAt: new Date().toISOString(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): RaidSession | undefined {
  return sessions.get(id);
}

export function getAllSessions(): RaidSession[] {
  return Array.from(sessions.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function claimSlot(
  sessionId: string,
  slotIndex: number,
  userId: string,
  username: string
): { success: boolean; message: string } {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, message: "Sesi tidak ditemukan." };

  const slot = session.slots[slotIndex];
  if (!slot) return { success: false, message: "Slot tidak ditemukan." };

  if (slot.claimedBy) {
    if (slot.claimedBy === userId) {
      return { success: false, message: "Kamu sudah mengisi slot ini." };
    }
    return { success: false, message: `Slot ini sudah diisi oleh **${slot.claimedUsername}**.` };
  }

  const alreadyHasSlot = session.slots.findIndex((s) => s.claimedBy === userId);
  if (alreadyHasSlot !== -1) {
    return {
      success: false,
      message: `Kamu sudah mendaftar sebagai **${session.slots[alreadyHasSlot]?.role}**. Gunakan tombol Leave untuk keluar dulu.`,
    };
  }

  slot.claimedBy = userId;
  slot.claimedUsername = username;
  return { success: true, message: `Berhasil join sebagai **${slot.role}**!` };
}

export function releaseSlot(
  sessionId: string,
  slotIndex: number,
  userId: string
): { success: boolean; message: string } {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, message: "Sesi tidak ditemukan." };

  const slot = session.slots[slotIndex];
  if (!slot) return { success: false, message: "Slot tidak ditemukan." };

  if (slot.claimedBy !== userId) {
    return { success: false, message: "Kamu tidak mengisi slot ini." };
  }

  const roleName = slot.role;
  slot.claimedBy = null;
  slot.claimedUsername = null;
  return { success: true, message: `Berhasil keluar dari slot **${roleName}**.` };
}

export function setMessageRef(sessionId: string, messageId: string, channelId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.messageId = messageId;
    session.channelId = channelId;
  }
}
