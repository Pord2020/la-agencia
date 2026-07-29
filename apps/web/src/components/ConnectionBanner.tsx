// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { t, type Locale } from "../lib/i18n";

export function ConnectionBanner({
  online,
  locale,
  onReconnect,
}: {
  online: boolean;
  locale: Locale;
  onReconnect: () => void;
}) {
  if (online) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/85 p-6 backdrop-blur-sm">
      <div className="pixel-panel max-w-md p-6 text-center text-ink">
        <div className="font-pixel text-[11px] text-ink mb-3">
          {t(locale, "offlineTitle")}
        </div>
        <p className="text-sm leading-relaxed mb-4">
          {t(locale, "offlineBody")}
        </p>
        <button
          type="button"
          className="pixel-btn pixel-btn-primary w-full"
          onClick={onReconnect}
        >
          {t(locale, "reconnect")}
        </button>
      </div>
    </div>
  );
}
