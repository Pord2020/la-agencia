// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function AgentsPanel({
  hired,
  onHire,
  onClose,
}: {
  hired: string[];
  onHire: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [tree, setTree] = useState<
    Record<string, Record<string, Array<{ id: string; name: string }>>>
  >({});
  const [count, setCount] = useState(0);
  const [openType, setOpenType] = useState<string | null>("core");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void api.agents().then((r) => {
      setTree(r.tree);
      setCount(r.count);
    });
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="pixel-panel flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b-4 border-ink bg-cream-dark px-4 py-3">
          <div>
            <div className="font-pixel text-[10px]">
              Equipo · {count} agentes
            </div>
            <div className="text-xs text-ink-soft">
              Organizados por tipo → categoría
            </div>
          </div>
          <button type="button" className="pixel-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-40 shrink-0 overflow-auto border-r-4 border-ink bg-cream-dark/50 p-2">
            {Object.keys(tree).map((t) => (
              <button
                key={t}
                type="button"
                className={`mb-1 w-full px-2 py-1 text-left text-xs ${
                  openType === t ? "bg-sun font-semibold" : ""
                }`}
                onClick={() => setOpenType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-3 text-sm text-ink">
            {openType &&
              Object.entries(tree[openType] || {}).map(([cat, agents]) => (
                <div key={cat} className="mb-4">
                  <div className="mb-1 font-pixel text-[8px] text-ink-soft">
                    {cat}
                  </div>
                  <div className="space-y-1">
                    {agents.map((a) => {
                      const isHired = hired.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2 border border-ink/20 px-2 py-1 hover:bg-cream-dark"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(a.id) || isHired}
                            disabled={isHired}
                            onChange={() => toggle(a.id)}
                          />
                          <span>
                            {a.name}{" "}
                            {isHired && (
                              <span className="text-xs text-green-700">
                                · en oficina
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="border-t-4 border-ink p-3">
          <button
            type="button"
            className="pixel-btn pixel-btn-primary"
            disabled={selected.size === 0}
            onClick={() => {
              onHire([...selected]);
              setSelected(new Set());
            }}
          >
            Contratar seleccionados
          </button>
        </div>
      </div>
    </div>
  );
}
