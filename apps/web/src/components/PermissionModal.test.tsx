// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionModal } from "./PermissionModal";

describe("PermissionModal", () => {
  it("does not offer session-wide trust for critical work", () => {
    const onResolve = vi.fn();
    render(
      <PermissionModal
        request={{
          id: "permission",
          title: "Compartir",
          summary: "Publicar preview",
          recommended: "deny",
          kind: "deploy_production",
          riskLevel: "critical",
          expiresAt: new Date().toISOString(),
        }}
        onResolve={onResolve}
      />,
    );
    expect(screen.queryByText(/Confiar este tipo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("No, detener"));
    expect(onResolve).toHaveBeenCalledWith("deny");
  });
});
