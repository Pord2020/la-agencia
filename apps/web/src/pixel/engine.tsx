// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

// ─────────────────────────────────────────────────────────────
// VibeMap · Motor de la oficina (canvas 448×256, escalado por CSS)
// Movimiento por baldosas: flechas/WASD, clic para caminar (BFS),
// teclas F / E / espacio para hablar (estilo Pokémon).
// ─────────────────────────────────────────────────────────────

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  DESK_SLOTS,
  FURNITURE_HOTSPOT,
  FURNITURE_PLACEMENTS,
  HOTSPOTS,
  MAP_H,
  MAP_W,
  PLAYER_SPAWN,
  PO_SLOT,
  TILE,
  hotspotAt,
  isStaticSolid,
  tileKeyAt,
} from "./office";
import {
  FURNITURE,
  TILES,
  buildCharacter,
  drawSprite,
  type Accessory,
  type Direction,
  type Palette,
  type SpriteMap,
  type WorkPose,
} from "./sprites";
import { sfx } from "../lib/sfx";

export interface NPCPlacement {
  id: string;
  slotIndex: number; // índice en DESK_SLOTS
  palette: Palette;
  accessory: Accessory;
  hasNew: boolean;
  /** Working indicator above head */
  busy?: boolean;
  /** Visual work animation while busy */
  pose?: WorkPose;
  /** If false, player cannot open dialogue (sub-agent in room) */
  interactable?: boolean;
  displayName?: string;
}

export interface EngineProps {
  npcs: NPCPlacement[];
  playerPalette: Palette;
  playerAccessory: Accessory;
  poPalette: Palette;
  highlightTile?: { x: number; y: number } | null;
  onInteract: (id: string) => void;
  controlsEnabled: boolean;
}

export interface EngineHandle {
  walkTo: (tx: number, ty: number, thenInteract?: string) => void;
  playerTile: () => { x: number; y: number };
}

// Sprites auxiliares
const ARROW: SpriteMap = [
  "..KKKKK..",
  ".KYYYYYK.",
  "KYYYYYYYK",
  ".KYYYYYK.",
  "..KKYKK..",
  "...KYK...",
  "....K....",
];
const ARROW_PAL: Palette = { Y: "#ffd866", K: "#22223b" };
const BUBBLE: SpriteMap = [
  ".KKKKK.",
  "KWWWWWK",
  "KWKKWKK",
  "KWKKWK.",
  "KW.KWK.",
  "KWKKWK.",
  "KWWWWWK",
  ".KKKKK.",
  "...K...",
];
const BUBBLE_PAL: Palette = { K: "#22223b", W: "#fffdf5" };

interface Vec {
  x: number;
  y: number;
}

const tileCenter = (t: Vec): Vec => ({
  x: t.x * TILE + TILE / 2,
  y: t.y * TILE + TILE / 2,
});

function bfsPath(start: Vec, goal: Vec, blocked: Set<string>): Vec[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  const prev = new Map<string, Vec | null>();
  const q: Vec[] = [start];
  prev.set(`${start.x},${start.y}`, null);
  const dirs = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Vec[] = [];
      let c: Vec | null = cur;
      while (c && !(c.x === start.x && c.y === start.y)) {
        path.unshift(c);
        c = prev.get(`${c.x},${c.y}`) ?? null;
      }
      return path;
    }
    for (const d of dirs) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      const k = `${n.x},${n.y}`;
      if (n.x < 0 || n.y < 0 || n.x >= MAP_W || n.y >= MAP_H) continue;
      if (prev.has(k) || blocked.has(k)) continue;
      prev.set(k, cur);
      q.push(n);
    }
  }
  return [];
}

const playerFrames = buildCharacter("none");
const poFrames = buildCharacter("tie");

export const OfficeEngine = forwardRef<EngineHandle, EngineProps>(
  function OfficeEngine(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const propsRef = useRef(props);
    propsRef.current = props;

    // Estado mutable del juego
    const game = useRef({
      pos: tileCenter(PLAYER_SPAWN) as Vec,
      tile: { ...PLAYER_SPAWN } as Vec,
      dir: "up" as Direction,
      moving: false,
      frame: 0,
      frameTimer: 0,
      path: [] as Vec[],
      pendingInteract: null as string | null,
      keys: [] as Direction[],
      bobTimer: 0,
      arrowTimer: 0,
    });

    const walkTo = (tx: number, ty: number, thenInteract?: string) => {
      const g = game.current;
      const blocked = blockedTiles();
      blocked.delete(`${tx},${ty}`);
      const goal = { x: tx, y: ty };
      if (isStaticSolid(tx, ty) || occupiedByNpc(tx, ty)) {
        // buscar vecino caminable más cercano al objetivo
        const neighbors = [
          { x: tx, y: ty + 1 },
          { x: tx, y: ty - 1 },
          { x: tx - 1, y: ty },
          { x: tx + 1, y: ty },
        ].filter((n) => !blocked.has(`${n.x},${n.y}`));
        let best: Vec[] = [];
        for (const n of neighbors) {
          const p = bfsPath(g.tile, n, blocked);
          if (p.length && (!best.length || p.length < best.length)) best = p;
        }
        if (!best.length) {
          if (neighbors.length) best = bfsPath(g.tile, neighbors[0], blocked);
        }
        g.path = best.map(tileCenter);
      } else {
        g.path = bfsPath(g.tile, goal, blocked).map(tileCenter);
      }
      g.pendingInteract = thenInteract ?? null;
      // Si ya estamos en el destino, disparar la interacción de inmediato
      if (g.path.length === 0 && g.pendingInteract) {
        const id = g.pendingInteract;
        g.pendingInteract = null;
        setTimeout(() => propsRef.current.onInteract(id), 60);
      }
    };

    const occupiedByNpc = (tx: number, ty: number): boolean => {
      if (tx === PO_SLOT.x && ty === PO_SLOT.y) return true;
      return propsRef.current.npcs.some((n) => {
        const s = DESK_SLOTS[n.slotIndex];
        return s && s.x === tx && s.y === ty;
      });
    };

    const blockedTiles = (): Set<string> => {
      const b = new Set<string>();
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++)
          if (isStaticSolid(x, y)) b.add(`${x},${y}`);
      b.add(`${PO_SLOT.x},${PO_SLOT.y}`);
      propsRef.current.npcs.forEach((n) => {
        const s = DESK_SLOTS[n.slotIndex];
        if (s) b.add(`${s.x},${s.y}`);
      });
      return b;
    };

    useImperativeHandle(ref, () => ({
      walkTo,
      playerTile: () => ({ ...game.current.tile }),
    }));

    useEffect(() => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;

      const keyMap: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
        W: "up",
        S: "down",
        A: "left",
        D: "right",
      };

      const tryInteract = () => {
        if (!propsRef.current.controlsEnabled) return;
        const g = game.current;
        const ahead: Vec = {
          x: g.tile.x + (g.dir === "left" ? -1 : g.dir === "right" ? 1 : 0),
          y: g.tile.y + (g.dir === "up" ? -1 : g.dir === "down" ? 1 : 0),
        };
        const candidates: Vec[] = [
          g.tile,
          ahead,
          { x: g.tile.x, y: g.tile.y + 1 },
          { x: g.tile.x, y: g.tile.y - 1 },
          { x: g.tile.x - 1, y: g.tile.y },
          { x: g.tile.x + 1, y: g.tile.y },
        ];
        for (const c of candidates) {
          if (c.x === PO_SLOT.x && c.y === PO_SLOT.y) {
            propsRef.current.onInteract("po");
            return;
          }
          const npc = propsRef.current.npcs.find((n) => {
            const s = DESK_SLOTS[n.slotIndex];
            return s && s.x === c.x && s.y === c.y;
          });
          if (npc) {
            if (npc.interactable === false) {
              propsRef.current.onInteract(`worker:${npc.id}`);
              return;
            }
            propsRef.current.onInteract(`npc:${npc.id}`);
            return;
          }
          const h = hotspotAt(c.x, c.y);
          if (h) {
            propsRef.current.onInteract(h.id);
            return;
          }
        }
        sfx.denied();
      };

      const isTypingTarget = (target: EventTarget | null) =>
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      const onKeyDown = (e: KeyboardEvent) => {
        if (!propsRef.current.controlsEnabled) return;
        // Let form fields (chat input, settings) receive WASD/E/F/space.
        if (isTypingTarget(e.target)) return;
        const dir = keyMap[e.key];
        if (dir) {
          e.preventDefault();
          const g = game.current;
          if (!g.keys.includes(dir)) g.keys.push(dir);
          return;
        }
        if (
          e.key === "e" ||
          e.key === "E" ||
          e.key === "f" ||
          e.key === "F" ||
          e.key === " " ||
          e.key === "Enter"
        ) {
          e.preventDefault();
          tryInteract();
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        const dir = keyMap[e.key];
        if (dir) {
          const g = game.current;
          g.keys = g.keys.filter((k) => k !== dir);
        }
      };

      const onClick = (e: MouseEvent) => {
        if (!propsRef.current.controlsEnabled) return;
        const rect = canvas.getBoundingClientRect();
        const ix = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
        const iy = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
        const tx = Math.floor(ix / TILE);
        const ty = Math.floor(iy / TILE);
        const g = game.current;
        // ¿clic en el PO?
        if (tx === PO_SLOT.x && ty === PO_SLOT.y) {
          walkTo(tx, ty, "po");
          return;
        }
        // ¿clic en un NPC?
        const npc = propsRef.current.npcs.find((n) => {
          const s = DESK_SLOTS[n.slotIndex];
          return s && s.x === tx && s.y === ty;
        });
        if (npc) {
          walkTo(tx, ty, `npc:${npc.id}`);
          return;
        }
        const h = hotspotAt(tx, ty);
        if (h) {
          walkTo(tx, ty, h.id);
          return;
        }
        g.pendingInteract = null;
        const blocked = blockedTiles();
        if (blocked.has(`${tx},${ty}`)) {
          // ¿Es el escritorio de alguien del equipo?
          const deskOwner = propsRef.current.npcs.find((n) => {
            const s = DESK_SLOTS[n.slotIndex];
            return s && ty === s.y + 1 && (tx === s.x || tx === s.x + 1);
          });
          if (deskOwner) {
            walkTo(tx, ty, `npc:${deskOwner.id}`);
            return;
          }
          // ¿Es un mueble con zona interactiva?
          const hsId = FURNITURE_HOTSPOT[`${tx},${ty}`];
          const hs = hsId ? HOTSPOTS.find((h) => h.id === hsId) : null;
          if (hs) {
            let best: Vec[] = [];
            let bestTile = hs.tiles[0];
            for (const t of hs.tiles) {
              if (blocked.has(`${t.x},${t.y}`)) continue;
              const p = bfsPath(g.tile, t, blocked);
              if (p.length && (!best.length || p.length < best.length)) {
                best = p;
                bestTile = t;
              }
            }
            if (best.length || !blocked.has(`${bestTile.x},${bestTile.y}`)) {
              walkTo(bestTile.x, bestTile.y, hs.id);
            }
          }
          return;
        }
        g.path = bfsPath(g.tile, { x: tx, y: ty }, blocked).map(tileCenter);
      };

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      canvas.addEventListener("click", onClick);

      // ── Bucle principal ──────────────────────────────────────
      let raf = 0;
      let last = performance.now();
      let stepSfxTimer = 0;

      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const g = game.current;
        const SPEED = 68;

        // Movimiento
        if (g.path.length) {
          const target = g.path[0];
          const dx = target.x - g.pos.x;
          const dy = target.y - g.pos.y;
          const dist = Math.hypot(dx, dy);
          g.moving = true;
          if (Math.abs(dx) > Math.abs(dy)) g.dir = dx > 0 ? "right" : "left";
          else if (Math.abs(dy) > 0.5) g.dir = dy > 0 ? "down" : "up";
          if (dist <= SPEED * dt) {
            g.pos = { ...target };
            g.tile = {
              x: Math.floor(g.pos.x / TILE),
              y: Math.floor(g.pos.y / TILE),
            };
            g.path.shift();
            if (!g.path.length && g.pendingInteract) {
              const id = g.pendingInteract;
              g.pendingInteract = null;
              propsRef.current.onInteract(id);
            }
          } else {
            g.pos.x += (dx / dist) * SPEED * dt;
            g.pos.y += (dy / dist) * SPEED * dt;
          }
          g.frameTimer += dt;
          stepSfxTimer += dt;
          if (stepSfxTimer > 0.28) {
            stepSfxTimer = 0;
            sfx.step();
          }
          if (g.frameTimer > 0.16) {
            g.frameTimer = 0;
            g.frame = (g.frame + 1) % 2;
          }
        } else {
          g.moving = false;
          g.frame = 0;
          // Entrada por teclado: siguiente baldosa
          if (propsRef.current.controlsEnabled && g.keys.length) {
            const dir = g.keys[g.keys.length - 1];
            g.dir = dir;
            const nt = {
              x: g.tile.x + (dir === "left" ? -1 : dir === "right" ? 1 : 0),
              y: g.tile.y + (dir === "up" ? -1 : dir === "down" ? 1 : 0),
            };
            const blocked = blockedTiles();
            if (!blocked.has(`${nt.x},${nt.y}`)) {
              g.path = [tileCenter(nt)];
            }
          }
        }
        g.bobTimer += dt;
        g.arrowTimer += dt;

        // ── Dibujo ─────────────────────────────────────────────
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Baldosas
        for (let y = 0; y < MAP_H; y++) {
          for (let x = 0; x < MAP_W; x++) {
            const key = tileKeyAt(x, y);
            if (key === "door") {
              ctx.fillStyle = "#2a2438";
              ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
              continue;
            }
            const t = TILES[key] ?? TILES.floor;
            drawSprite(ctx, t.map, t.palette, x * TILE, y * TILE);
          }
        }

        // Objetos ordenados por profundidad (pies)
        type Drawable = { feetY: number; draw: () => void };
        const drawables: Drawable[] = [];

        // Muebles
        for (const f of FURNITURE_PLACEMENTS) {
          const spr = FURNITURE[f.sprite];
          if (!spr) continue;
          drawables.push({
            feetY: f.ty * TILE + spr.map.length,
            draw: () =>
              drawSprite(ctx, spr.map, spr.palette, f.tx * TILE, f.ty * TILE),
          });
        }

        // PO (Pau) en recepción
        const poBob = Math.floor(g.bobTimer / 0.7) % 2 === 0 ? 0 : 1;
        drawables.push({
          feetY: PO_SLOT.y * TILE + 17,
          draw: () =>
            drawSprite(
              ctx,
              poFrames.down[poBob === 0 ? 0 : 1],
              propsRef.current.poPalette,
              PO_SLOT.x * TILE,
              PO_SLOT.y * TILE - 1,
            ),
        });

        // NPCs del equipo
        for (const n of propsRef.current.npcs) {
          const s = DESK_SLOTS[n.slotIndex];
          if (!s) continue;
          const bob =
            Math.floor(g.bobTimer / 0.7 + n.slotIndex * 0.3) % 2 === 0 ? 0 : 1;
          drawables.push({
            feetY: s.y * TILE + 17,
            draw: () => {
              // Pick pose: typing / thinking while busy, else idle bob
              const pose = n.pose ?? (n.busy ? "type" : "idle");
              let frame: SpriteMap;
              if (pose === "type") {
                frame = playerFrames.type[bob === 0 ? 0 : 1];
              } else if (pose === "think") {
                frame = playerFrames.think[bob === 0 ? 0 : 1];
              } else {
                frame = playerFrames.down[bob === 0 ? 0 : 1];
              }
              drawSprite(ctx, frame, n.palette, s.x * TILE, s.y * TILE - 1);
              if (n.busy) {
                // Working dots ··· above head (readable “they’re working”)
                const t = g.arrowTimer * 4;
                const phase = Math.floor(t) % 3;
                ctx.fillStyle = "#ffd866";
                for (let i = 0; i < 3; i++) {
                  const on = i <= phase;
                  ctx.globalAlpha = on ? 1 : 0.25;
                  ctx.fillRect(s.x * TILE + 3 + i * 4, s.y * TILE - 12, 3, 3);
                }
                ctx.globalAlpha = 1;
              } else if (n.hasNew) {
                const bounce = Math.sin(g.arrowTimer * 5 + n.slotIndex) * 1.5;
                drawSprite(
                  ctx,
                  BUBBLE,
                  BUBBLE_PAL,
                  s.x * TILE + 4,
                  s.y * TILE - 15 + bounce,
                );
              }
            },
          });
        }

        // Jugador
        const pFrames = playerFrames[g.dir];
        const pSprite = g.moving ? pFrames[g.frame === 0 ? 1 : 2] : pFrames[0];
        drawables.push({
          feetY: g.pos.y + 9,
          draw: () =>
            drawSprite(
              ctx,
              pSprite,
              propsRef.current.playerPalette,
              Math.round(g.pos.x - 8),
              Math.round(g.pos.y - 9),
            ),
        });

        drawables.sort((a, b) => a.feetY - b.feetY);
        drawables.forEach((d) => d.draw());

        // Flecha de highlight
        const hl = propsRef.current.highlightTile;
        if (hl) {
          const bounce = Math.sin(g.arrowTimer * 6) * 2;
          drawSprite(
            ctx,
            ARROW,
            ARROW_PAL,
            hl.x * TILE + 3,
            hl.y * TILE - 10 + bounce,
          );
        }

        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("click", onClick);
      };
    }, []);

    return (
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="h-auto w-full [image-rendering:pixelated]"
        style={{ display: "block" }}
      />
    );
  },
);
