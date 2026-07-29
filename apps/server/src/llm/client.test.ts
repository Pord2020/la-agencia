// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import {
  DEFAULT_SETTINGS,
  type AdapterId,
  type AgencySettings,
} from "@la-agencia/shared";
import {
  chatCompletion,
  listReadySubscriptions,
  offlinePoReply,
  pickSubscriptionAdapter,
  subscriptionChat,
  type SubscriptionRuntime,
} from "./client.js";

function settings(
  provider: AgencySettings["llm"]["provider"] = "openai",
): AgencySettings {
  return {
    ...DEFAULT_SETTINGS,
    llm: {
      provider,
      model: "test-model",
      apiKey: "test-key",
    },
    modelsByTier: {
      cheap: "cheap-model",
      medium: "medium-model",
      high: "high-model",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LLM client", () => {
  it("only reports isolated subscriptions as safe and selects none in tests", async () => {
    const ready = await listReadySubscriptions();
    expect(ready).toHaveLength(6);
    expect(ready.find((entry) => entry.id === "codex")?.isolated).toBe(true);
    expect(ready.every((entry) => !entry.installed)).toBe(true);
    expect(await pickSubscriptionAdapter(settings())).toBeNull();
    await expect(
      subscriptionChat("claude-code", [{ role: "user", content: "hola" }]),
    ).rejects.toThrow("ADAPTER_CHAT_NOT_ISOLATED");
    await expect(subscriptionChat("not-real" as AdapterId, [])).rejects.toThrow(
      "ADAPTER_UNSUPPORTED",
    );
  });

  it("selects only an installed isolated adapter with an injected resolver", async () => {
    const resolver: SubscriptionRuntime["resolveBin"] = vi.fn(async (id) =>
      id === "codex" ? { bin: "codex", path: "/safe/codex" } : null,
    );
    const configured = {
      ...settings(),
      primaryAdapter: "claude-code" as AdapterId,
      enabledAdapters: ["cursor", "codex"] as AdapterId[],
    };
    await expect(pickSubscriptionAdapter(configured, resolver)).resolves.toBe(
      "codex",
    );
    const ready = await listReadySubscriptions(resolver);
    expect(ready.find((entry) => entry.id === "codex")?.installed).toBe(true);
    expect(ready.find((entry) => entry.id === "claude-code")?.installed).toBe(
      false,
    );
  });

  it("runs Codex chat in an empty temporary workspace and cleans CLI chrome", async () => {
    let runtimeDirectory = "";
    const runtime: SubscriptionRuntime = {
      resolveBin: async () => ({ bin: "codex", path: "/safe/codex" }),
      environment: (_id, directory) => {
        runtimeDirectory = directory;
        return { HOME: directory };
      },
      execute: async (_path, args, options) => {
        expect(args).toContain("read-only");
        expect(readdirSync(options.cwd)).toEqual([]);
        return {
          stdout: "loading internal CLI\nHola, respuesta aislada y segura.",
          stderr: "",
        };
      },
    };
    await expect(
      subscriptionChat(
        "codex",
        [
          { role: "system", content: "Sé claro." },
          { role: "user", content: "Hola" },
        ],
        runtime,
      ),
    ).resolves.toBe("Hola, respuesta aislada y segura.");
    expect(runtimeDirectory).not.toBe("");
    expect(existsSync(runtimeDirectory)).toBe(false);
  });

  it("maps missing, empty and authentication failures to stable errors", async () => {
    const baseRuntime: SubscriptionRuntime = {
      resolveBin: async () => null,
      environment: () => ({}),
      execute: async () => ({ stdout: "", stderr: "" }),
    };
    await expect(subscriptionChat("codex", [], baseRuntime)).rejects.toThrow(
      "ADAPTER_NOT_INSTALLED",
    );
    await expect(
      subscriptionChat("codex", [], {
        ...baseRuntime,
        resolveBin: async () => ({ bin: "codex", path: "/safe/codex" }),
      }),
    ).rejects.toThrow("EMPTY_RESPONSE");
    await expect(
      subscriptionChat("codex", [], {
        ...baseRuntime,
        resolveBin: async () => ({ bin: "codex", path: "/safe/codex" }),
        execute: async () => {
          throw new Error("unauthorized login required");
        },
      }),
    ).rejects.toThrow("ADAPTER_NOT_LOGGED_IN");
    await expect(
      subscriptionChat("codex", [], {
        ...baseRuntime,
        resolveBin: async () => ({ bin: "codex", path: "/safe/codex" }),
        execute: async () => ({ stdout: "ok", stderr: "" }),
      }),
    ).resolves.toBe("ok");
  });

  it("explains both missing and installed subscription states", () => {
    expect(offlinePoReply("una idea", "guided", [])).toContain("Qué hacer");
    const installed = offlinePoReply("un producto", "advanced", [
      { id: "codex", label: "Codex", installed: true },
      { id: "claude", label: "Claude", installed: false },
    ]);
    expect(installed).toContain("iniciar sesión");
    expect(installed).toContain("Claude");
    expect(offlinePoReply("x".repeat(300), "standard", [])).toContain("…");
  });

  it("calls OpenAI-compatible providers with the selected tier", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "  respuesta segura  " } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chatCompletion(settings("groq"), [{ role: "user", content: "hola" }], {
        tier: "cheap",
        temperature: 0.2,
      }),
    ).resolves.toBe("respuesta segura");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toMatchObject({ model: "cheap-model", temperature: 0.2 });
  });

  it("supports Anthropic responses and stable provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [
                { type: "text", text: "primera" },
                { type: "tool_use" },
                { type: "text", text: "segunda" },
              ],
            }),
          ),
      ),
    );
    await expect(
      chatCompletion(settings("anthropic"), [
        { role: "system", content: "system" },
        { role: "user", content: "hola" },
      ]),
    ).resolves.toBe("primera\nsegunda");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("anthropic denied", { status: 429 })),
    );
    await expect(chatCompletion(settings("anthropic"), [])).rejects.toThrow(
      "Anthropic error 429",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    await expect(
      chatCompletion(settings("xai"), [{ role: "user", content: "hola" }]),
    ).rejects.toThrow("LLM error 401");
    await expect(
      chatCompletion(
        {
          ...settings(),
          llm: { ...settings().llm, apiKey: undefined },
        },
        [{ role: "user", content: "hola" }],
      ),
    ).rejects.toThrow("NO_SUBSCRIPTION");
  });

  it("honors custom base URLs and falls back from an unsafe forced adapter to an API key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "fallback" } }] }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const custom = {
      ...settings("custom"),
      llm: {
        provider: "custom" as const,
        model: "custom-model",
        apiKey: "test-key",
        baseUrl: "https://custom.example.test/v1/",
      },
    };
    await expect(
      chatCompletion(custom, [], { forceAdapter: "claude-code" }),
    ).resolves.toBe("fallback");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://custom.example.test/v1/chat/completions",
    );

    for (const [provider, expected] of [
      ["xai", "https://api.x.ai/v1/chat/completions"],
      ["kimi", "https://api.moonshot.ai/v1/chat/completions"],
    ] as const) {
      fetchMock.mockClear();
      await chatCompletion(settings(provider), []);
      expect(fetchMock.mock.calls[0][0]).toBe(expected);
    }
  });
});
