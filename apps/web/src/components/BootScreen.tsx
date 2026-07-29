// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "react";

export function BootScreen({ onEnter }: { onEnter: () => void }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 bg-arcade px-6">
      <div className="scanlines pointer-events-none absolute inset-0" />
      <div className="font-pixel text-center text-2xl leading-relaxed text-cream sm:text-4xl">
        LA AGENCIA
      </div>
      <div className="font-pixel text-center text-[10px] leading-loose text-sky sm:text-xs max-w-md">
        Tu consultora de agentes · local · con tu suscripción
      </div>
      <button
        type="button"
        className="pixel-btn pixel-btn-primary relative z-10 px-8 py-4 text-[10px] sm:text-xs"
        onClick={onEnter}
      >
        Entrar a la oficina
      </button>
      <div
        className={`font-pixel text-[8px] text-cream/40 transition-opacity ${
          blink ? "opacity-100" : "opacity-40"
        }`}
      >
        WASD caminar · F hablar con líderes
      </div>
    </div>
  );
}
