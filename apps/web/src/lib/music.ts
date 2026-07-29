// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module music
 * Optional ambient lo-fi when the user has a connected subscription (“Cloud” / coding account).
 *
 * We stream a public lo-fi radio URL. If the stream fails or the user has no
 * connected account, we stay silent — never force audio.
 *
 * Not affiliated with any commercial “Cloud FM” brand; stream URL is configurable.
 */

const DEFAULT_LOFI =
  // Community lo-fi stream (SomaFM Groove Salad / similar public endpoints vary).
  // Using a well-known free ice cast style URL; if blocked, music simply stays off.
  "https://ice1.somafm.com/groovesalad-128-mp3";

let audio: HTMLAudioElement | null = null;

export function isMusicPlaying(): boolean {
  return Boolean(audio && !audio.paused);
}

/**
 * Start ambient music only when allowed.
 * @param connected - true if a coding subscription adapter is ready
 */
export async function startAmbientMusic(
  connected: boolean,
  url = DEFAULT_LOFI,
): Promise<void> {
  if (!connected) {
    stopAmbientMusic();
    return;
  }
  try {
    if (!audio) {
      audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.25;
      audio.crossOrigin = "anonymous";
    }
    await audio.play();
  } catch {
    // Autoplay policies or network — silent is fine.
    stopAmbientMusic();
  }
}

export function stopAmbientMusic() {
  if (audio) {
    audio.pause();
    audio = null;
  }
}

export function toggleAmbientMusic(connected: boolean): Promise<boolean> {
  if (isMusicPlaying()) {
    stopAmbientMusic();
    return Promise.resolve(false);
  }
  return startAmbientMusic(connected).then(() => isMusicPlaying());
}
