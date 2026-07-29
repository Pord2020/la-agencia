// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/** Bottom dialogue box — Pokémon style */

export function PokemonDialogue({
  speakerName,
  speakerRole,
  lines,
  input,
  onInput,
  onSend,
  onClose,
  busy,
  placeholder,
  sendLabel,
  talkingToLabel,
}: {
  speakerName: string;
  speakerRole?: string;
  lines: string[];
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  busy?: boolean;
  placeholder: string;
  sendLabel: string;
  talkingToLabel: string;
}) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 px-2 pb-2 sm:px-4 sm:pb-3">
      <div className="pixel-panel mx-auto max-w-3xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b-4 border-ink bg-cream-dark px-3 py-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-soft">
              {talkingToLabel}
            </div>
            <div className="font-pixel text-[10px] text-ink">
              {speakerName}
              {speakerRole ? (
                <span className="ml-2 font-sans text-xs font-normal text-ink-soft">
                  · {speakerRole}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="text-xs underline text-ink-soft"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="max-h-36 space-y-2 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {lines.length === 0 && <p className="text-ink-soft text-xs">…</p>}
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          {busy && (
            <p className="font-pixel text-[8px] text-ink-soft animate-pulse">
              ···
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t-4 border-ink p-2">
          <input
            className="min-w-0 flex-1 border-2 border-ink px-2 py-2 text-sm text-ink"
            value={input}
            disabled={busy}
            placeholder={placeholder}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSend();
            }}
            autoFocus
          />
          <button
            type="button"
            className="pixel-btn pixel-btn-primary shrink-0"
            disabled={busy || !input.trim()}
            onClick={onSend}
          >
            {sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
