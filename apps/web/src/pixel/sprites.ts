// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

// ─────────────────────────────────────────────────────────────
// VibeMap · Sprites procedurales 8-bit
// Todos los gráficos se generan en código: cada sprite es una
// matriz de caracteres donde cada letra apunta a un color de
// paleta. '.' = transparente.
// ─────────────────────────────────────────────────────────────

export type SpriteMap = string[];
export type Palette = Record<string, string>;

export const INK = "#22223b";

// ── Personajes ───────────────────────────────────────────────
// Plantilla chibi 16×16. Letras:
// K contorno · S piel · H pelo · T ropa · P pantalón · Z zapatos
// E ojos · M boca · A accesorio

const HEAD_DOWN = [
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHSSSSSSSSHK..",
  "..KSSSSSSSSSSK..",
  "..KSEESSSSEESK..",
  "..KSSSSSSSSSSK..",
  "...KSSMMMMSSK...",
  "....KKSSSSKK....",
];

const HEAD_UP = [
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "...KHHHHHHHK....",
  "....KKSSKK......",
];

const HEAD_LEFT = [
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KSSSSHHHHHHK..",
  "..KSSSSSHHHHHK..",
  "..KEESSSHHHHHK..",
  "..KSSSSSHHHHHK..",
  "...KMSSHHHHK....",
  "....KKSSKKK.....",
];

const BODY_DOWN = [
  "..KKTTTTTTTTKK..",
  ".KTTTTTTTTTTTTK.",
  ".KSTTTTTTTTTTSK.",
  ".KSTTTTTTTTTTSK.",
  "..KKTTTTTTTTKK..",
];

const BODY_LEFT = [
  "...KKTTTTTTKK...",
  "..KSTTTTTTTTK...",
  "..KSTTTTTTTTK...",
  "..KKTTTTTTTTK...",
  "...KKTTTTTKK....",
];

const LEGS_IDLE = ["..KPPPPPPPPPPK..", "..KPPPKKKPPPK...", "..KZZK...KZZK..."];

const LEGS_A = ["..KPPPPPPPPPPK..", ".KPPPK...KPPPK..", ".KZZK.....KZZK.."];

const LEGS_B = ["..KPPPPPPPPPPK..", "..KPPPK...KPPPK.", "..KZZK.....KZZK."];

const LEGS_IDLE_SIDE = [
  "...KPPPPPPK.....",
  "...KPPPKPPK.....",
  "...KZZK.KZZK....",
];

const LEGS_A_SIDE = [
  "...KPPPPPPK.....",
  "..KPPPK..KPPK...",
  "..KZZK...KZZK...",
];

const LEGS_B_SIDE = [
  "...KPPPPPPK.....",
  "..KPPK..KPPPK...",
  "..KZZK...KZZK...",
];

export type Direction = "down" | "up" | "left" | "right";
export type Accessory = "none" | "glasses" | "cap" | "tie" | "band" | "bun";

function mirrorRows(rows: string[]): string[] {
  return rows.map((r) => r.split("").reverse().join(""));
}

function applyAccessory(rows: string[], acc: Accessory): string[] {
  const r = [...rows];
  if (acc === "glasses") {
    // Gafas: marco alrededor de los ojos (fila 5)
    const row = r[5].split("");
    [3, 6, 9, 12].forEach((c) => {
      if (row[c] && row[c] !== "K") row[c] = "A";
      else if (row[c] === "S") row[c] = "A";
    });
    r[5] = row.join("");
  } else if (acc === "cap") {
    r[0] = "....KKAAAAKK....";
    r[1] = "..KKAAAAAAAAKK..";
    r[2] = "..KAAAAAAAAAHK..";
  } else if (acc === "tie") {
    const r9 = r[9].split("");
    if (r9[7] === "T") r9[7] = "A";
    if (r9[8] === "T") r9[8] = "A";
    r[9] = r9.join("");
    const r10 = r[10].split("");
    if (r10[7] === "T") r10[7] = "A";
    if (r10[8] === "T") r10[8] = "A";
    r[10] = r10.join("");
  } else if (acc === "band") {
    // Cinta de pelo / coleta
    r[1] = "...KKHHHHHHKK...";
    r[2] = "..KHHHAAAAHHK...";
  } else if (acc === "bun") {
    r[0] = "...KKKKKKKKK....";
    r[1] = "..KHHAHHHHAHK...";
  }
  return r;
}

/**
 * Animation poses for office workers.
 * Original chibi frames — not based on any third-party sprite sheet layout.
 */
export type WorkPose = "idle" | "walk" | "type" | "think";

export interface CharacterFrames {
  down: SpriteMap[];
  up: SpriteMap[];
  left: SpriteMap[];
  right: SpriteMap[];
  /** Hands-on-keyboard loop (2 frames). */
  type: SpriteMap[];
  /** Contemplative “thinking” loop (2 frames). */
  think: SpriteMap[];
}

/** Typing: body leans slightly; second frame “taps” keys (accessory color on desk edge). */
const BODY_TYPE_A = [
  "..KKTTTTTTTTKK..",
  ".KTTTTTTTTTTTTK.",
  ".KSTTTTTTTTTTSK.",
  ".KSSTTTTTTTTSSK.",
  "..KKTTTTTTTTKK..",
];
const BODY_TYPE_B = [
  "..KKTTTTTTTTKK..",
  ".KTTTTTTTTTTTTK.",
  ".KSTTTTTTTTTTSK.",
  ".KSAATTTTTTTASK.",
  "..KKTTTTTTTTKK..",
];

/** Think: hand near chin (accessory pixel on head). */
const HEAD_THINK_A = [
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHSSSSSSSSHK..",
  "..KSSSSSSSSSSK..",
  "..KSEESSSSEESK..",
  "..KSSSSASSSSSK..",
  "...KSSMMMMSSK...",
  "....KKSSSSKK....",
];
const HEAD_THINK_B = [
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHSSSSSSSSHK..",
  "..KSSSSSSSSSSK..",
  "..KSEESSSSEESK..",
  "..KSSSSAASSSSK..",
  "...KSSMMMMSSK...",
  "....KKSSSSKK....",
];

export function buildCharacter(acc: Accessory = "none"): CharacterFrames {
  const mk = (head: string[], body: string[], legs: string[]) =>
    applyAccessory([...head, ...body, ...legs], acc);
  const down: SpriteMap[] = [
    mk(HEAD_DOWN, BODY_DOWN, LEGS_IDLE),
    mk(HEAD_DOWN, BODY_DOWN, LEGS_A),
    mk(HEAD_DOWN, BODY_DOWN, LEGS_B),
  ];
  const up: SpriteMap[] = [
    mk(HEAD_UP, BODY_DOWN, LEGS_IDLE),
    mk(HEAD_UP, BODY_DOWN, LEGS_A),
    mk(HEAD_UP, BODY_DOWN, LEGS_B),
  ];
  const left: SpriteMap[] = [
    mk(HEAD_LEFT, BODY_LEFT, LEGS_IDLE_SIDE),
    mk(HEAD_LEFT, BODY_LEFT, LEGS_A_SIDE),
    mk(HEAD_LEFT, BODY_LEFT, LEGS_B_SIDE),
  ];
  const right: SpriteMap[] = left.map(mirrorRows);
  const type: SpriteMap[] = [
    mk(HEAD_DOWN, BODY_TYPE_A, LEGS_IDLE),
    mk(HEAD_DOWN, BODY_TYPE_B, LEGS_IDLE),
  ];
  const think: SpriteMap[] = [
    mk(HEAD_THINK_A, BODY_DOWN, LEGS_IDLE),
    mk(HEAD_THINK_B, BODY_DOWN, LEGS_IDLE),
  ];
  return { down, up, left, right, type, think };
}

// ── Muebles y objetos ────────────────────────────────────────
// Sprites más grandes, cada uno con su propia paleta.

export const FURNITURE: Record<
  string,
  { map: SpriteMap; palette: Palette; solid?: boolean }
> = {
  desk: {
    palette: {
      K: INK,
      W: "#b0793f",
      w: "#8f5c2c",
      S: "#7de3f0",
      s: "#3aa7bd",
      B: "#5a5f7d",
    },
    map: [
      "................................",
      "......KKKKKKKKKK................",
      "......KSSSSSSSSK................",
      "......KSssssssSK................",
      "......KSSSSSSSSK................",
      "......KKKKKKKKKK................",
      "........KBBBBK..................",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KwWWWWWWWWWWWWWWWWWWWWWWWWWWWWwK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "..KK..........................KK",
      "..KK..........................KK",
      "..KK..........................KK",
    ],
  },
  counter: {
    palette: { K: INK, W: "#c98d4b", w: "#a86f35", T: "#e8b06a", P: "#7de3f0" },
    map: [
      "................................................",
      "....................KKKKKKKKKK..................",
      "....................KPPPPPPPPK..................",
      "....................KKKKKKKKKK..................",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KwWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KwWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
  },
  plant: {
    palette: { K: INK, G: "#3e9b4f", g: "#2e7d3b", T: "#b5654a", t: "#8f4a35" },
    map: [
      ".....KK..KK.....",
      "....KGGKKGGK....",
      "...KGGGGGGGGK...",
      "..KGGgGGGGgGGK..",
      "..KGgGGGGGGgGK..",
      "...KGGGGgGGK....",
      "....KKgGgKK.....",
      "......KggK......",
      ".....KKKKKK.....",
      "....KTTTTTTK....",
      "....KTTTTTTK....",
      "....KtTTTTtK....",
      "....KttttttK....",
      "....KKKKKKKK....",
    ],
  },
  cabinet: {
    palette: { K: INK, W: "#8a93b8", w: "#6d7499", H: "#e8e4d8" },
    map: [
      ".KKKKKKKKKKKKKK.",
      ".KWWWWWWWWWWWWK.",
      ".KWwWWWWWWWWwWK.",
      ".KWKKKKKKKKKKWK.",
      ".KWKHHHHHHHHKWK.",
      ".KWKKKKKKKKKKWK.",
      ".KWwWWWWWWWWwWK.",
      ".KWKKKKKKKKKKWK.",
      ".KWKHHHHHHHHKWK.",
      ".KWKKKKKKKKKKWK.",
      ".KWwWWWWWWWWwWK.",
      ".KWKKKKKKKKKKWK.",
      ".KWKHHHHHHHHKWK.",
      ".KWKKKKKKKKKKWK.",
      ".KKKKKKKKKKKKKK.",
    ],
  },
  whiteboard: {
    palette: {
      K: INK,
      W: "#f5f2e8",
      F: "#8a93b8",
      R: "#e25c5c",
      B: "#4a7de2",
      G: "#3e9b4f",
    },
    map: [
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KWWRRRRWWWWBBBBBWWWWWWWGGGWWWWWK",
      "KWWRWWWRWWWBWWWBWWWWWGWWWGWWWWWK",
      "KWWRRRRWWWWBBBBBWWWWWWGGGWWWWWWK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KWWBBBWWWWWRRRRRWWWWBBBBWWWWWWWK",
      "KWWBWBWWWWWRWWWWWWWWWBWWBWWWWWWK",
      "KWWBBBWWWWWRWWWWWWWWBBBBWWWWWWWK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "..KFK........................KFK",
      "..KFK........................KFK",
      "..KFK........................KFK",
    ],
  },
  kitchen: {
    palette: {
      K: INK,
      W: "#c9cede",
      w: "#a3a9c2",
      F: "#e25c5c",
      P: "#5a5f7d",
      S: "#e8e4d8",
    },
    map: [
      "................................",
      "..........KKKK..................",
      ".........KPPPPK.....KKK.........",
      "........KPPPPPPK...KFFSK........",
      "........KKKKKKK....KFFSK........",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KwWWWWKKKKKKWWWWWWKKKKKKWWWWWWwK",
      "KWWWWWKAAAAAKWWWWWKAAAAAKWWWWWWK",
      "KwWWWWKKKKKKWWWWWWKKKKKKWWWWWWwK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "..KK..........................KK",
      "..KK..........................KK",
    ],
  },
  sofa: {
    palette: { K: INK, W: "#7d6ba8", w: "#6b5a95", C: "#9487c2" },
    map: [
      "................................",
      ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
      ".KCCCCCCCCCCCCCCCCCCCCCCCCCCCK..",
      ".KCWWWWWWWWWWKKKWWWWWWWWWWWCCK..",
      ".KCWWWWWWWWWWK.KWWWWWWWWWWWCCK..",
      "KKKWWWWWWWWWWK.KWWWWWWWWWWWKKKK.",
      "KWWWWWWWWWWWWK.KWWWWWWWWWWWWKWWK",
      "KWKKKKKKKKKKKK.KKKKKKKKKKKKKKwWK",
      "KWKKKKKKKKKKKKKKKKKKKKKKKKKKKwWK",
      ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
    ],
  },
  table: {
    palette: { K: INK, W: "#b0793f", B: "#e25c5c", b: "#f5f2e8" },
    map: [
      "................",
      ".....KKKKK......",
      "....KBbbbBK.....",
      "....KBbbbBK.....",
      "KKKKKKKKKKKKKKKK",
      "KWWWWWWWWWWWWWWK",
      "KKKKKKKKKKKKKKKK",
      "...KK......KK...",
      "...KK......KK...",
    ],
  },
  bookshelf: {
    palette: {
      K: INK,
      W: "#a86f35",
      R: "#e25c5c",
      B: "#4a7de2",
      G: "#3e9b4f",
      Y: "#e2b84a",
      P: "#8b5cf6",
    },
    map: [
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KRKKBKKGKKYKKPKKRKKBKKGKKYKKPKKK",
      "KRKKBKKGKKYKKPKKRKKBKKGKKYKKPKKK",
      "KRKKBKKGKKYKKPKKRKKBKKGKKYKKPKKK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KKYKKPKKRKKBKKGKKYKKPKKRKKBKKGKK",
      "KKYKKPKKRKKBKKGKKYKKPKKRKKBKKGKK",
      "KKYKKPKKRKKBKKGKKYKKPKKRKKBKKGKK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KGKKYKKPKKRKKBKKRGKKYKKPKKRKKBKK",
      "KGKKYKKPKKRKKBKKRGKKYKKPKKRKKBKK",
      "KGKKYKKPKKRKKBKKRGKKYKKPKKRKKBKK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
  },
  cooler: {
    palette: { K: INK, W: "#e8e6df", B: "#7de3f0", b: "#3aa7bd" },
    map: [
      ".....KKKKKK.....",
      "....KBBBBBBK....",
      "...KBbbbbbbBK...",
      "...KBbBBBBbBK...",
      "...KBbbbbbbBK...",
      "....KBBBBBBK....",
      "....KKKKKKKK....",
      "....KWWWWWWK....",
      "....KWKKKKWK....",
      "....KWWWWWWK....",
      "....KWKKKKWK....",
      "....KWWWWWWK....",
      "....KKKKKKKK....",
    ],
  },
  frame: {
    palette: { K: INK, W: "#c9a35a", S: "#7de3f0", s: "#3aa7bd" },
    map: [
      "KKKKKKKKKKKKKKKK",
      "KWWWWWWWWWWWWWWK",
      "KWKKKKKKKKKKKKWK",
      "KWKSSSSSSSSSSKWK",
      "KWKSSssSSSSsKWWK",
      "KWKSSSSsSSSSKWWK",
      "KWKSSSSSSSSsKWWK",
      "KWKKKKKKKKKKKKWK",
      "KWWWWWWWWWWWWWWK",
      "KKKKKKKKKKKKKKKK",
    ],
  },
  sign: {
    palette: { K: INK, W: "#2f3352", Y: "#ffd866", y: "#e2b84a" },
    map: [
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KWYKYYKYWKYKYYKYWKYYYYYKYYYKYYYKYYYYKYKYYYYKYYYKYYYYYKYYYYKWWWWK",
      "KWYKYKYKWKYKWKYKWKYKWWWKYWKYKYKYKWKWWKYKWKWWKYWKYKYKWKYWKYKWWWWK",
      "KWYKYYYKKKYKWKYKWKYKWKWKYYYKYYKYKWKWWKYKWKWWKYWKYKYKWKYWKYKWWWWK",
      "KWYKYKYKYKYKWKYKWKYKWWWKYWKYKYKYKWKWWKYKWKWWKYWKYKYKWKYWKYKWWWWK",
      "KWYKYYKYKYKYYYKYWYKYYYYKYWKYKYKYKYYYYKYYYYYKYYYKYYYYYKYYYYKWWWWK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
  },
};

// ── Baldosas (tiles 16×16) ───────────────────────────────────

export const TILES: Record<string, { map: SpriteMap; palette: Palette }> = {
  floor: {
    palette: { a: "#dcbd95", b: "#d4b189", c: "#c9a173" },
    map: [
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "cccccccccccccccc",
      "cccccccccccccccc",
      "cccccccccccccccc",
      "cccccccccccccccc",
    ],
  },
  carpet: {
    palette: { a: "#8574b3", b: "#7967a5", c: "#6b5a95" },
    map: [
      "aaaaaaaaaaaaaaaa",
      "abbbbbbbbbbbbbba",
      "abaaaaaaaaaaaaba",
      "abaaaaaaaaaaaaba",
      "abaaaccccccaaaba",
      "abaaacccccaaaaba",
      "abaaacccccaaaaba",
      "abaaaccccccaaaba",
      "abaaaaaaaaaaaaba",
      "abaaaaaaaaaaaaba",
      "abaaaaaaaaaaaaba",
      "abaaaaaaaaaaaaba",
      "abaaaaaaaaaaaaba",
      "abaaaaaaaaaaaaba",
      "abbbbbbbbbbbbbba",
      "aaaaaaaaaaaaaaaa",
    ],
  },
  kitchen: {
    palette: { a: "#eceade", b: "#d7d9cc" },
    map: [
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa",
    ],
  },
  wall: {
    palette: { a: "#f0e6d2", b: "#e2d5ba", c: "#c9b992", K: INK },
    map: [
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "cccccccccccccccc",
      "cccccccccccccccc",
      "KKKKKKKKKKKKKKKK",
      "KKKKKKKKKKKKKKKK",
    ],
  },
  doormat: {
    palette: { a: "#b5654a", b: "#a0543c", c: "#e8b06a" },
    map: [
      "aaaaaaaaaaaaaaaa",
      "abbbbbbbbbbbbbba",
      "abacccccccccccba",
      "abacccccccccccba",
      "abacccccccccccba",
      "abacccccccccccba",
      "abbbbbbbbbbbbbba",
      "aaaaaaaaaaaaaaaa",
    ],
  },
};

// ── Renderizado ──────────────────────────────────────────────

const spriteCache = new Map<string, HTMLCanvasElement>();

export function spriteKey(map: SpriteMap, palette: Palette): string {
  return (
    map.join("|") +
    "::" +
    Object.entries(palette)
      .map(([k, v]) => k + v)
      .join(",")
  );
}

/** Dibuja un sprite en un canvas offscreen (cacheado) y lo devuelve */
export function renderSprite(
  map: SpriteMap,
  palette: Palette,
): HTMLCanvasElement {
  const key = spriteKey(map, palette);
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const h = map.length;
  const w = Math.max(...map.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  spriteCache.set(key, c);
  return c;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  map: SpriteMap,
  palette: Palette,
  x: number,
  y: number,
  scale = 1,
) {
  const c = renderSprite(map, palette);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, x, y, c.width * scale, c.height * scale);
}
