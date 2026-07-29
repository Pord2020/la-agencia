// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module officeMap
 * Floor plan for La Agencia HQ — original layout inspired by RPG town halls,
 * not a clone of any third-party office map.
 *
 * Tile size 16px. Canvas = MAP_W × MAP_H × TILE.
 * Characters: W wall · . floor · k kitchen · c carpet · m mat · D door · r rug
 */

export const TILE = 16;
/** Wider campus so departments feel like rooms in a Pokémon-style building. */
export const MAP_W = 36;
export const MAP_H = 18;
export const CANVAS_W = MAP_W * TILE;
export const CANVAS_H = MAP_H * TILE;

export const MAP: string[] = [
  "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
  "W......rrrrrr......W.....kkkkkk....W",
  "W......rrrrrr......W.....kkkkkk....W",
  "W..................W...............W",
  "W..................................W",
  "W..................................W",
  "W..................................W",
  "W..................................W",
  "W..................................W",
  "W..................................W",
  "W..cccccccc........................W",
  "W..cccccccc........................W",
  "W..cccccccc........................W",
  "W..cccccccc........................W",
  "W..cccccccc....mm..................W",
  "W..............mm..................W",
  "W..............mm..................W",
  "WWWWWWWWWWWWWWWDDWWWWWWWWWWWWWWWWWWW",
];

export function tileKeyAt(tx: number, ty: number): string {
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return "wall";
  const ch = MAP[ty][tx];
  switch (ch) {
    case "W":
      return "wall";
    case "k":
      return "kitchen";
    case "c":
      return "carpet";
    case "m":
      return "doormat";
    case "D":
      return "door";
    case "r":
      return "carpet";
    default:
      return "floor";
  }
}

export interface FurniturePlacement {
  sprite: string;
  tx: number;
  ty: number;
}

export const FURNITURE_PLACEMENTS: FurniturePlacement[] = [
  // Showroom frames
  { sprite: "frame", tx: 2, ty: 0 },
  { sprite: "frame", tx: 4, ty: 0 },
  { sprite: "frame", tx: 6, ty: 0 },
  { sprite: "frame", tx: 8, ty: 0 },
  { sprite: "sign", tx: 14, ty: 0 },
  { sprite: "whiteboard", tx: 20, ty: 0 },
  { sprite: "kitchen", tx: 28, ty: 0 },
  { sprite: "cooler", tx: 25, ty: 0 },
  // Lounge
  { sprite: "bookshelf", tx: 1, ty: 10 },
  { sprite: "sofa", tx: 3, ty: 11 },
  { sprite: "table", tx: 6, ty: 12 },
  // Archive wall
  { sprite: "cabinet", tx: 33, ty: 6 },
  { sprite: "cabinet", tx: 33, ty: 9 },
  { sprite: "cabinet", tx: 33, ty: 12 },
  // Reception
  { sprite: "counter", tx: 15, ty: 13 },
  { sprite: "desk", tx: 30, ty: 13 },
  // Plants
  { sprite: "plant", tx: 1, ty: 1 },
  { sprite: "plant", tx: 11, ty: 15 },
  { sprite: "plant", tx: 24, ty: 15 },
  { sprite: "plant", tx: 34, ty: 3 },
  // Leader desks — engineering row
  { sprite: "desk", tx: 4, ty: 4 },
  { sprite: "desk", tx: 9, ty: 4 },
  { sprite: "desk", tx: 14, ty: 4 },
  { sprite: "desk", tx: 19, ty: 4 },
  // Second row
  { sprite: "desk", tx: 4, ty: 8 },
  { sprite: "desk", tx: 9, ty: 8 },
  { sprite: "desk", tx: 14, ty: 8 },
  { sprite: "desk", tx: 19, ty: 8 },
  // Sub-office pods
  { sprite: "desk", tx: 26, ty: 6 },
  { sprite: "desk", tx: 30, ty: 6 },
];

const solidSet = new Set<string>();
const key = (x: number, y: number) => `${x},${y}`;

function addSolid(tx: number, ty: number, w = 1, h = 1) {
  for (let y = ty; y < ty + h; y++)
    for (let x = tx; x < tx + w; x++) solidSet.add(key(x, y));
}

for (let x = 0; x < MAP_W; x++) {
  addSolid(x, 0);
  addSolid(x, MAP_H - 1);
}
for (let y = 0; y < MAP_H; y++) {
  addSolid(0, y);
  addSolid(MAP_W - 1, y);
}

addSolid(20, 1, 2, 1);
addSolid(28, 1, 2, 1);
addSolid(25, 1, 1, 1);
addSolid(1, 10, 2, 1);
addSolid(3, 11, 2, 1);
addSolid(6, 12, 1, 1);
addSolid(33, 6, 1, 1);
addSolid(33, 9, 1, 1);
addSolid(33, 12, 1, 1);
addSolid(15, 13, 3, 1);
addSolid(30, 13, 2, 1);
addSolid(1, 1, 1, 1);
addSolid(11, 15, 1, 1);
addSolid(24, 15, 1, 1);
addSolid(34, 3, 1, 1);
// Desks solid
[4, 8].forEach((y) => [4, 9, 14, 19].forEach((x) => addSolid(x, y, 2, 1)));
addSolid(26, 6, 2, 1);
addSolid(30, 6, 2, 1);

export function isStaticSolid(tx: number, ty: number): boolean {
  return solidSet.has(key(tx, ty));
}

export interface DeskSlot {
  x: number;
  y: number;
}

/** Seats behind desks (leaders + sub-office workers). */
export const DESK_SLOTS: DeskSlot[] = [
  { x: 4, y: 3 }, // alex
  { x: 9, y: 3 }, // maya
  { x: 14, y: 3 }, // leo
  { x: 19, y: 3 }, // nora
  { x: 4, y: 7 }, // sam
  { x: 9, y: 7 }, // ana
  { x: 26, y: 5 }, // worker-fe
  { x: 30, y: 5 }, // worker-be
];

export const LEADER_SLOTS: Record<string, number> = {
  alex: 0,
  maya: 1,
  leo: 2,
  nora: 3,
  sam: 4,
  ana: 5,
};

export const PO_SLOT: DeskSlot = { x: 16, y: 12 };
export const PLAYER_SPAWN: DeskSlot = { x: 16, y: 15 };

export const DEPARTMENT_LABELS: Array<{
  id: string;
  label: string;
  labelEn: string;
  x: number;
  y: number;
}> = [
  {
    id: "engineering",
    label: "Ingeniería",
    labelEn: "Engineering",
    x: 4,
    y: 2,
  },
  { id: "marketing", label: "Marketing", labelEn: "Marketing", x: 9, y: 2 },
  { id: "design", label: "Diseño", labelEn: "Design", x: 14, y: 2 },
  { id: "legal", label: "Legal", labelEn: "Legal", x: 19, y: 2 },
  { id: "qa", label: "QA", labelEn: "QA", x: 4, y: 6 },
  { id: "helpdesk", label: "Asistente", labelEn: "Assistant", x: 9, y: 6 },
  { id: "suboffice", label: "Suboficina", labelEn: "Sub-office", x: 27, y: 4 },
  { id: "kitchen", label: "Cocina", labelEn: "Kitchen", x: 28, y: 1 },
];

export interface Hotspot {
  id: string;
  label: string;
  tiles: DeskSlot[];
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: "reception",
    label: "Recepción",
    tiles: [
      { x: 15, y: 14 },
      { x: 16, y: 14 },
      { x: 17, y: 14 },
    ],
  },
  {
    id: "showroom",
    label: "Salón de pantallas",
    tiles: [2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, y: 1 })),
  },
  {
    id: "whiteboard",
    label: "La pizarra",
    tiles: [
      { x: 20, y: 2 },
      { x: 21, y: 2 },
    ],
  },
  {
    id: "kitchen",
    label: "La cocina",
    tiles: [27, 28, 29, 30].map((x) => ({ x, y: 2 })),
  },
  {
    id: "book",
    label: "Biblioteca",
    tiles: [
      { x: 1, y: 11 },
      { x: 2, y: 11 },
    ],
  },
  {
    id: "archive",
    label: "Archivo",
    tiles: [5, 6, 7, 8, 9, 10, 11, 12].map((y) => ({ x: 32, y })),
  },
];

export function hotspotAt(tx: number, ty: number): Hotspot | null {
  for (const h of HOTSPOTS) {
    if (h.tiles.some((t) => t.x === tx && t.y === ty)) return h;
  }
  return null;
}

/** Map furniture tile → hotspot for click routing. */
export const FURNITURE_HOTSPOT: Record<string, string> = {
  "20,1": "whiteboard",
  "21,1": "whiteboard",
  "28,1": "kitchen",
  "29,1": "kitchen",
  "1,10": "book",
  "2,10": "book",
  "33,6": "archive",
  "33,9": "archive",
  "33,12": "archive",
  "15,13": "reception",
  "16,13": "reception",
  "17,13": "reception",
};
