import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sample = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample.trp");

test("parses a .trp locally and renders the dashboard", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TEMS Lab Analyzer" })).toBeVisible();

  await page.setInputFiles('input[type="file"]', sample);

  // dashboard appears after the Web Worker finishes parsing
  await expect(page.getByText("Analysing")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Max downlink")).toBeVisible();
  await expect(page.getByText("Telia")).toBeVisible();

  await page.getByRole("button", { name: "Radio params" }).click();
  await expect(page.getByText("256QAM")).toBeVisible();
  await expect(page.getByText("TM4")).toBeVisible();

  await page.getByRole("button", { name: "Coverage" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  expect(pageErrors, "no uncaught page errors").toEqual([]);
});
