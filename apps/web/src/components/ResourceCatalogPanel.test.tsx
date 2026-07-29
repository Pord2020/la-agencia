// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ResourceCatalogPanel } from "./ResourceCatalogPanel";

vi.mock("../lib/api", () => ({
  api: {
    catalog: vi.fn(),
    refreshCatalog: vi.fn(),
    resourceInstallations: vi.fn(),
    requestResourceInstall: vi.fn(),
    requestResourceRemoval: vi.fn(),
  },
}));

const catalogMock = vi.mocked(api.catalog);
const refreshMock = vi.mocked(api.refreshCatalog);
const installationsMock = vi.mocked(api.resourceInstallations);

describe("ResourceCatalogPanel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    catalogMock.mockResolvedValue({
      items: [
        {
          id: "agent:awesome:starter_ai_agents/ai_travel_agent",
          kind: "agent",
          name: "Ai Travel Agent",
          description: "Starter agent template",
          url: "https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/starter_ai_agents/ai_travel_agent",
          repository: "Shubhamsaboo/awesome-llm-apps",
          repositoryUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
          source: "github-curated:Shubhamsaboo/awesome-llm-apps",
          category: "starter-agent",
          trust: "verified",
          score: 95,
          stars: 128_000,
          forks: 18_000,
          license: "Apache-2.0",
          topics: ["agent-template"],
          resourcePath: "starter_ai_agents/ai_travel_agent",
          indexedAt: "2026-07-28T12:00:00.000Z",
          riskFlags: [
            "not-installed",
            "template-only",
            "review-code-before-use",
          ],
        },
        {
          id: "skill:openai/skills:skills/docs/SKILL.md",
          kind: "skill",
          name: "openai/skills · docs",
          description: "Official documentation skill",
          url: "https://github.com/openai/skills/tree/main/skills/docs",
          repository: "openai/skills",
          repositoryUrl: "https://github.com/openai/skills",
          source: "openai/skills",
          category: "agent-skills",
          trust: "official",
          score: 90,
          stars: 10_000,
          forks: 500,
          license: "CHECK_SOURCE",
          topics: ["agent-skills"],
          indexedAt: "2026-07-28T12:00:00.000Z",
          riskFlags: ["license-review-required"],
        },
      ],
      total: 2,
      refreshedAt: "2026-07-28T12:00:00.000Z",
      nextRefreshAt: "2026-07-29T12:00:00.000Z",
      updating: false,
      errors: [],
    });
    refreshMock.mockResolvedValue({
      count: 1,
      refreshedAt: "2026-07-28T12:00:00.000Z",
      nextRefreshAt: "2026-07-29T12:00:00.000Z",
      updating: false,
      errors: [],
    });
    installationsMock.mockResolvedValue({ installations: [] });
  });

  it("explains license review and never implies automatic installation", async () => {
    render(
      <ResourceCatalogPanel
        locale="es"
        projectId="project"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("openai/skills · docs")).toBeInTheDocument();
    expect(
      screen.getByText(/Revisa la licencia propia del skill/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nada se instala automáticamente/),
    ).toBeInTheDocument();
    expect(screen.getByText(/verificado · 95\/100/)).toBeInTheDocument();
    expect(screen.getByText("solo plantilla")).toBeInTheDocument();
  });

  it("requests a refresh only after the user explicitly asks", async () => {
    render(
      <ResourceCatalogPanel
        locale="en"
        projectId="project"
        onClose={vi.fn()}
      />,
    );
    await screen.findByText("openai/skills · docs");
    expect(refreshMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce());
  });

  it("exposes agent templates as their own filter", async () => {
    render(
      <ResourceCatalogPanel
        locale="en"
        projectId="project"
        onClose={vi.fn()}
      />,
    );
    await screen.findByText("Ai Travel Agent");

    fireEvent.click(screen.getByRole("button", { name: /Agents/ }));
    await waitFor(() =>
      expect(catalogMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "agent", limit: 500 }),
      ),
    );
  });
});
