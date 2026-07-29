// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { t, type Locale } from "../lib/i18n";

export function OfficeSidebar({
  locale,
  offices,
  activeId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onNew,
}: {
  locale: Locale;
  offices: Array<{
    id: string;
    name: string;
    adapterId: string | null;
    projectId: string | null;
  }>;
  activeId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r-4 border-cream/20 bg-ink/90 transition-all ${
        collapsed ? "w-10" : "w-48"
      }`}
    >
      <button
        type="button"
        className="border-b border-cream/20 px-2 py-2 text-left font-pixel text-[8px] text-sun"
        onClick={onToggleCollapse}
        title={t(locale, "offices")}
      >
        {collapsed ? "»" : `« ${t(locale, "offices")}`}
      </button>
      {!collapsed && (
        <>
          {offices.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              className={`border-b border-cream/10 px-2 py-2 text-left text-xs ${
                activeId === o.id
                  ? "bg-sun/20 text-sun"
                  : "text-cream/80 hover:bg-cream/5"
              }`}
            >
              <div className="font-semibold truncate">{o.name}</div>
              <div className="text-[10px] opacity-70 truncate">
                {o.adapterId || "—"} {o.projectId ? "· proyecto" : ""}
              </div>
            </button>
          ))}
          <button
            type="button"
            className="m-2 pixel-btn pixel-btn-primary text-[8px]"
            onClick={onNew}
          >
            {t(locale, "newOffice")}
          </button>
        </>
      )}
    </aside>
  );
}
