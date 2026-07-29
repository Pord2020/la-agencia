// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Generates deterministic RGBA PNGs for the experimental Tauri shell.
 *
 * The pixel geometry mirrors apps/desktop/assets/icon.svg and intentionally
 * uses only Node built-ins so contributors can reproduce the assets offline.
 */

import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(repositoryRoot, "apps/desktop/src-tauri/icons");
const checkOnly = process.argv.includes("--check");

const palette = {
  background: [0x1a, 0x1a, 0x2e, 0xff],
  border: [0xf5, 0xef, 0xe0, 0xff],
  mark: [0xf3, 0xc9, 0x69, 0xff],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function roundedRectangleContains(x, y, inset, radius, size) {
  const min = inset;
  const max = size - inset - 1;
  if (x < min || x > max || y < min || y > max) return false;
  const cornerX = x < min + radius ? min + radius : max - radius;
  const cornerY = y < min + radius ? min + radius : max - radius;
  if (x >= min + radius && x <= max - radius) return true;
  if (y >= min + radius && y <= max - radius) return true;
  return (x - cornerX) ** 2 + (y - cornerY) ** 2 <= radius ** 2;
}

function isMarkPixel(x, y, scale) {
  const px = x / scale;
  const py = y / scale;
  const letterL =
    (px >= 24 && px < 38 && py >= 28 && py < 88) ||
    (px >= 24 && px < 60 && py >= 74 && py < 88);
  if (letterL) return true;
  if (py < 28 || py >= 88) return false;
  const spread = (py - 28) * 0.433;
  const left = 84 - spread;
  const right = 84 + spread;
  const strokes =
    Math.abs(px - left) <= 6 ||
    Math.abs(px - right) <= 6 ||
    (py >= 60 && py < 69 && px >= left && px <= right);
  return strokes && px >= 56 && px < 120;
}

function generatePng(size) {
  const scale = size / 128;
  const rows = [];
  const outerInset = Math.max(1, Math.round(6 * scale));
  const borderWidth = Math.max(1, Math.round(6 * scale));
  const radius = Math.max(2, Math.round(15 * scale));

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const outer = roundedRectangleContains(x, y, outerInset, radius, size);
      const inner = roundedRectangleContains(
        x,
        y,
        outerInset + borderWidth,
        Math.max(1, radius - borderWidth),
        size,
      );
      const color = isMarkPixel(x, y, scale)
        ? palette.mark
        : outer && !inner
          ? palette.border
          : palette.background;
      row.set(color, 1 + x * 4);
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outputs = [
  ["icon.png", 128],
  ["128x128.png", 128],
  ["32x32.png", 32],
];

mkdirSync(outputDirectory, { recursive: true });
for (const [name, size] of outputs) {
  const path = resolve(outputDirectory, name);
  const expected = generatePng(size);
  if (checkOnly) {
    let actual;
    try {
      actual = readFileSync(path);
    } catch {
      throw new Error(`Missing generated icon: ${name}`);
    }
    if (!actual.equals(expected)) {
      throw new Error(`Generated icon is stale: ${name}`);
    }
  } else {
    writeFileSync(path, expected);
  }
}

console.log(
  checkOnly
    ? "OK: desktop icons are reproducible"
    : "Generated desktop icons from the original MIT design",
);
