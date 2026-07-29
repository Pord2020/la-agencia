// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

export function DialogueBox({
  speakerName,
  speakerRole,
  lines,
  onClose,
  actions,
}: {
  speakerName: string;
  speakerRole?: string;
  lines: string[];
  onClose: () => void;
  actions?: Array<{ label: string; primary?: boolean; onClick: () => void }>;
}) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-4 sm:bottom-4">
      <div className="pixel-panel max-h-[42vh] overflow-auto p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            <div className="font-pixel text-[10px] text-ink">{speakerName}</div>
            {speakerRole && (
              <div className="text-xs text-ink-soft">{speakerRole}</div>
            )}
          </div>
          <button
            type="button"
            className="text-xs text-ink-soft underline"
            onClick={onClose}
          >
            cerrar
          </button>
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
        {actions && actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={`pixel-btn ${a.primary ? "pixel-btn-primary" : ""}`}
                onClick={a.onClick}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
