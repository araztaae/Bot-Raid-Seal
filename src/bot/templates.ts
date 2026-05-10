export interface SlotTemplate {
  role: string;
  category: "apostle" | "hitter";
}

export interface RaidTemplate {
  name: string;
  slots: SlotTemplate[];
}

export const RAID_TEMPLATES: Record<string, RaidTemplate> = {
  boma: {
    name: "Boma Dungeon",
    slots: [
      { role: "Apostle", category: "apostle" },
      { role: "High DPS", category: "hitter" },
      { role: "Any DPS", category: "hitter" },
      { role: "High Debuffer", category: "hitter" },
      { role: "Any Debuffer", category: "hitter" },
      { role: "Any Roles", category: "hitter" },
    ],
  },
  samael: {
    name: "Samael Fortress Madness",
    slots: [
      { role: "Apostle", category: "apostle" },
      { role: "High DPS", category: "hitter" },
      { role: "High Debuffer", category: "hitter" },
      { role: "Any Roles", category: "hitter" },
      { role: "Any Roles", category: "hitter" },
      { role: "Any Roles", category: "hitter" },
    ],
  },
};
