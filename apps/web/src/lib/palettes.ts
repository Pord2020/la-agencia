// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import type { Accessory, Palette } from "../pixel/sprites";

const INK = "#22223b";
export const pal = (
  skin: string,
  hair: string,
  top: string,
  pants = "#3f4a6b",
): Palette => ({
  K: INK,
  S: skin,
  H: hair,
  T: top,
  P: pants,
  Z: "#2a2438",
  E: INK,
  M: "#b5654a",
  A: "#ffd866",
});

export const PO_PALETTE: Palette = {
  ...pal("#f2c9a0", "#3b2f2f", "#2f3352"),
  A: "#e25c5c",
};
export const PLAYER_PALETTE = pal("#f2c9a0", "#7c4a1e", "#3e9b4f");

const POOL: Array<{ palette: Palette; accessory: Accessory }> = [
  { palette: pal("#f2c9a0", "#3b2f2f", "#2f4a8c"), accessory: "tie" },
  { palette: pal("#d9a066", "#c96f2e", "#0ea5a5"), accessory: "band" },
  { palette: pal("#f2c9a0", "#1e1e24", "#3e9b4f"), accessory: "glasses" },
  { palette: pal("#8d5524", "#1e1e24", "#635bff"), accessory: "cap" },
  { palette: pal("#f2c9a0", "#e25c5c", "#b5654a"), accessory: "bun" },
  { palette: pal("#d9a066", "#5b3a8c", "#1e1e24"), accessory: "glasses" },
  { palette: pal("#f2c9a0", "#3b2f2f", "#6c47ff"), accessory: "none" },
  { palette: pal("#e8c39e", "#7c4a1e", "#0c7c8c"), accessory: "band" },
];

export function lookForAgent(id: string, index: number) {
  if (id === "product-owner" || id === "po-pau")
    return { palette: PO_PALETTE, accessory: "tie" as Accessory };
  return POOL[index % POOL.length];
}
