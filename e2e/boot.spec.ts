// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { expect, test } from "@playwright/test";

test("the local-first office has a usable boot screen", async ({ page }) => {
  await page.goto("/#session=e2e-local-session-token-123456789012345");
  await expect(page.locator("button").first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/Agencia/i);
  await expect
    .poll(async () =>
      page.request.get("/api/status").then((response) => response.status()),
    )
    .toBe(200);
});

test("a non-technical user can open the safe resource library", async ({
  page,
}) => {
  await page.goto("/#session=e2e-local-session-token-123456789012345");
  await page
    .getByRole("button", { name: /Entrar a la oficina|Enter the office/i })
    .click();
  await page.getByRole("button", { name: /Biblioteca|Library/i }).click();
  await expect(
    page.getByText(/BIBLIOTECA DE RECURSOS|RESOURCE LIBRARY/i),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Nada se instala automáticamente|Nothing is installed automatically/i,
    ),
  ).toBeVisible();
});

test("the complete non-technical navigation switches between Spanish and English", async ({
  page,
}) => {
  await page.goto("/#session=e2e-local-session-token-123456789012345");
  await page
    .getByRole("button", { name: /Entrar a la oficina|Enter the office/i })
    .click();
  await expect(
    page.getByRole("button", { name: /Cuentas|Accounts/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team" })).toBeVisible();
  await expect(page.getByText(/Walk to a leader/i)).toBeVisible();
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cuentas" })).toBeVisible();
  await expect(page.getByText(/Acércate a un líder/i)).toBeVisible();
});
