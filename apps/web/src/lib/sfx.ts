// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

// Blips 8-bit generados con WebAudio, sin assets.
let ctx: AudioContext | null = null;
let enabled = true;

try {
  enabled = localStorage.getItem("vibemap-sfx") !== "off";
} catch {
  /* sin storage */
}

export function sfxEnabled() {
  return enabled;
}

export function toggleSfx() {
  enabled = !enabled;
  try {
    localStorage.setItem("vibemap-sfx", enabled ? "on" : "off");
  } catch {
    /* sin storage */
  }
  return enabled;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx)
      ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(
  freq: number,
  dur = 0.06,
  type: OscillatorType = "square",
  vol = 0.04,
  when = 0,
) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tick: () => blip(1200 + Math.random() * 300, 0.025, "square", 0.015),
  open: () => {
    blip(660, 0.07);
    blip(990, 0.09, "square", 0.04, 0.07);
  },
  close: () => blip(420, 0.08),
  confirm: () => {
    blip(523, 0.07);
    blip(659, 0.07, "square", 0.04, 0.07);
    blip(784, 0.12, "square", 0.04, 0.14);
  },
  step: () => blip(180 + Math.random() * 40, 0.03, "triangle", 0.02),
  denied: () => blip(160, 0.15, "sawtooth", 0.03),
};
