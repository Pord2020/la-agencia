// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type ResourceCatalogItemDTO,
  type ResourceInstallationDTO,
} from "../lib/api";
import type { Locale } from "../lib/i18n";

const RISK_LABELS_ES: Record<string, string> = {
  "browser-automation": "automatización del navegador",
  "cost-bearing": "puede generar costes",
  "data-ingestion": "ingesta de datos",
  "external-models": "modelos externos",
  "external-services-likely": "probables servicios externos",
  "external-tools": "herramientas externas",
  "filesystem-scan": "revisión del sistema de archivos",
  "git-history-read": "lectura del historial Git",
  "high-impact-domain": "dominio de alto impacto",
  "microphone-access": "acceso al micrófono",
  "network-access": "acceso a internet",
  "repository-read": "lectura del repositorio",
  "review-code-before-use": "revisar código antes de usar",
  "scheduled-background-work": "trabajo programado en segundo plano",
  "self-modifying": "puede automodificarse",
  "template-only": "solo plantilla",
};

function riskLabel(flag: string, locale: Locale): string {
  if (locale === "es" && RISK_LABELS_ES[flag]) return RISK_LABELS_ES[flag];
  return flag.replaceAll("-", " ");
}

export function ResourceCatalogPanel({
  locale,
  projectId,
  onClose,
}: {
  locale: Locale;
  projectId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ResourceCatalogItemDTO[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "repository" | "agent" | "skill">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string>();
  const [errors, setErrors] = useState<string[]>([]);
  const [installations, setInstallations] = useState<ResourceInstallationDTO[]>(
    [],
  );
  const [acquiringId, setAcquiringId] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.catalog({
        query,
        kind: kind === "all" ? undefined : kind,
        limit: 500,
      });
      setItems(result.items);
      setRefreshedAt(result.refreshedAt);
      setErrors(result.errors);
    } catch {
      setItems([]);
      setErrors(["catalog-unavailable"]);
    } finally {
      setLoading(false);
    }
  }, [kind, query]);

  const loadInstallations = useCallback(async () => {
    try {
      const result = await api.resourceInstallations(projectId);
      setInstallations(result.installations);
    } catch {
      setErrors((current) => [...current, "installations-unavailable"]);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    void loadInstallations();
    const refresh = () => void loadInstallations();
    window.addEventListener("agency:resources-updated", refresh);
    return () =>
      window.removeEventListener("agency:resources-updated", refresh);
  }, [loadInstallations]);

  const activeInstallations = useMemo(
    () =>
      new Map(
        installations
          .filter((installation) => installation.status === "active")
          .map((installation) => [installation.catalogItemId, installation]),
      ),
    [installations],
  );

  const counts = useMemo(
    () => ({
      repositories: items.filter((item) => item.kind === "repository").length,
      agents: items.filter((item) => item.kind === "agent").length,
      skills: items.filter((item) => item.kind === "skill").length,
    }),
    [items],
  );

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="pixel-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden text-ink">
        <div className="flex flex-wrap items-center gap-3 border-b-4 border-ink bg-cream-dark px-4 py-3">
          <div className="min-w-48 flex-1">
            <div className="font-pixel text-[10px]">
              {locale === "en" ? "RESOURCE LIBRARY" : "BIBLIOTECA DE RECURSOS"}
            </div>
            <div className="mt-1 text-xs text-ink-soft">
              {locale === "en"
                ? "Trusted repositories, agent templates and skills. Metadata only."
                : "Repositorios, plantillas de agentes y skills confiables. Solo metadatos."}
            </div>
          </div>
          <button
            type="button"
            className="pixel-btn"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void api
                .refreshCatalog()
                .then(() => load())
                .catch(() => setErrors(["catalog-refresh-failed"]))
                .finally(() => setRefreshing(false));
            }}
          >
            {refreshing
              ? locale === "en"
                ? "Updating…"
                : "Actualizando…"
              : locale === "en"
                ? "Update now"
                : "Actualizar ahora"}
          </button>
          <button type="button" className="pixel-btn" onClick={onClose}>
            {locale === "en" ? "Close" : "Cerrar"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b-2 border-ink/20 p-3">
          <input
            className="min-w-56 flex-1 border-2 border-ink bg-white px-3 py-2 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              locale === "en"
                ? "Search React, testing, payments…"
                : "Buscar React, testing, pagos…"
            }
          />
          {(["all", "repository", "agent", "skill"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`pixel-btn ${kind === value ? "pixel-btn-primary" : ""}`}
              onClick={() => setKind(value)}
            >
              {value === "all"
                ? locale === "en"
                  ? "All"
                  : "Todo"
                : value === "repository"
                  ? `Repos (${counts.repositories})`
                  : value === "agent"
                    ? `${locale === "en" ? "Agents" : "Agentes"} (${counts.agents})`
                    : `Skills (${counts.skills})`}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loading && (
            <p className="text-sm text-ink-soft">
              {locale === "en" ? "Searching…" : "Buscando…"}
            </p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-sm text-ink-soft">
              {locale === "en"
                ? "No matching resources in the local copy."
                : "No hay resultados en la copia local."}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="border-2 border-ink/30 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="mr-2 bg-ink px-2 py-0.5 text-[9px] uppercase text-cream">
                      {item.kind === "repository"
                        ? "repo"
                        : item.kind === "agent"
                          ? locale === "en"
                            ? "agent"
                            : "agente"
                          : "skill"}
                    </span>
                    <span className="text-[10px] font-semibold text-green-800">
                      {item.trust === "official"
                        ? locale === "en"
                          ? "official"
                          : "oficial"
                        : item.trust === "verified"
                          ? locale === "en"
                            ? `verified · ${item.score}/100`
                            : `verificado · ${item.score}/100`
                          : `${item.score}/100`}
                    </span>
                  </div>
                  <span className="text-[10px] text-ink-soft">
                    ★ {item.stars.toLocaleString()} · {item.license}
                  </span>
                </div>
                <h3 className="mt-2 break-words font-semibold">{item.name}</h3>
                <p className="mt-1 line-clamp-3 text-xs text-ink-soft">
                  {item.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[item.category, item.language, ...item.topics.slice(0, 3)]
                    .filter(Boolean)
                    .map((tag, tagIndex) => (
                      <span
                        key={`${tag}-${tagIndex}`}
                        className="border border-ink/20 px-1.5 py-0.5 text-[9px]"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
                {item.riskFlags.includes("license-review-required") && (
                  <p className="mt-2 text-[10px] text-amber-800">
                    {locale === "en"
                      ? "Review this skill's own license before installing."
                      : "Revisa la licencia propia del skill antes de instalar."}
                  </p>
                )}
                {item.riskFlags.some(
                  (flag) =>
                    flag !== "not-installed" &&
                    flag !== "license-review-required",
                ) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.riskFlags
                      .filter(
                        (flag) =>
                          flag !== "not-installed" &&
                          flag !== "license-review-required",
                      )
                      .slice(0, 4)
                      .map((flag) => (
                        <span
                          key={flag}
                          className="border border-amber-700/40 bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-900"
                        >
                          {riskLabel(flag, locale)}
                        </span>
                      ))}
                  </div>
                )}
                <a
                  className="mt-2 inline-block text-xs font-semibold text-blue-700 underline"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {locale === "en" ? "View source ↗" : "Ver fuente ↗"}
                </a>
                {activeInstallations.has(item.id) ? (
                  <div className="mt-3 border-t border-ink/20 pt-2">
                    <p className="text-[10px] font-semibold text-green-800">
                      {locale === "en"
                        ? `Acquired at ${activeInstallations.get(item.id)!.commit.slice(0, 8)}`
                        : `Adquirido en ${activeInstallations.get(item.id)!.commit.slice(0, 8)}`}
                    </p>
                    <button
                      type="button"
                      className="pixel-btn mt-2 text-[8px]"
                      disabled={acquiringId === item.id}
                      onClick={() => {
                        const installation = activeInstallations.get(item.id)!;
                        setAcquiringId(item.id);
                        void api
                          .requestResourceRemoval(installation.id, projectId)
                          .catch(() =>
                            setErrors((current) => [
                              ...current,
                              "resource-removal-failed",
                            ]),
                          )
                          .finally(() => setAcquiringId(undefined));
                      }}
                    >
                      {locale === "en"
                        ? "Remove safely"
                        : "Retirar de forma segura"}
                    </button>
                    {installations
                      .filter(
                        (installation) =>
                          installation.catalogItemId === item.id &&
                          installation.status === "superseded",
                      )
                      .map((installation) => (
                        <button
                          key={installation.id}
                          type="button"
                          className="pixel-btn ml-2 mt-2 text-[8px]"
                          disabled={acquiringId === item.id}
                          onClick={() => {
                            setAcquiringId(item.id);
                            void api
                              .requestResourceActivation(
                                installation.id,
                                projectId,
                              )
                              .catch(() =>
                                setErrors((current) => [
                                  ...current,
                                  "resource-activation-failed",
                                ]),
                              )
                              .finally(() => setAcquiringId(undefined));
                          }}
                        >
                          {locale === "en"
                            ? `Restore ${installation.commit.slice(0, 8)}`
                            : `Restaurar ${installation.commit.slice(0, 8)}`}
                        </button>
                      ))}
                  </div>
                ) : (
                  item.kind !== "repository" &&
                  item.license !== "CHECK_SOURCE" &&
                  !item.riskFlags.includes("self-modifying") && (
                    <button
                      type="button"
                      className="pixel-btn mt-3 block text-[8px]"
                      disabled={acquiringId === item.id}
                      onClick={() => {
                        setAcquiringId(item.id);
                        void api
                          .requestResourceInstall(item.id, projectId)
                          .catch(() =>
                            setErrors((current) => [
                              ...current,
                              "resource-install-failed",
                            ]),
                          )
                          .finally(() => setAcquiringId(undefined));
                      }}
                    >
                      {locale === "en"
                        ? "Acquire safely"
                        : "Adquirir de forma segura"}
                    </button>
                  )
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="border-t-2 border-ink/20 px-3 py-2 text-[10px] text-ink-soft">
          {refreshedAt
            ? `${locale === "en" ? "Updated" : "Actualizado"}: ${new Date(refreshedAt).toLocaleString()}`
            : locale === "en"
              ? "Waiting for the first daily update."
              : "Esperando la primera actualización diaria."}
          {errors.length > 0 &&
            ` · ${locale === "en" ? "Some sources used the cached copy" : "Algunas fuentes usaron la copia local"}`}
          {" · "}
          {locale === "en"
            ? "Nothing is installed automatically."
            : "Nada se instala automáticamente."}
        </div>
      </div>
    </div>
  );
}
