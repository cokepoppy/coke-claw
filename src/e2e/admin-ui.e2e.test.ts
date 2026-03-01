import test from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { startAdminProcess, stopChild, waitForAdminUrl } from "./helpers.js";

test("admin ui e2e: run coding_agent and manage session", { timeout: 240_000 }, async (t) => {
  const child = startAdminProcess();
  let browser: Browser | null = null;

  try {
    const baseUrl = await waitForAdminUrl(child, 20_000);

    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      t.skip(
        `Playwright chromium not available: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("text=Coke Claw Admin", { timeout: 10_000 });

    const sessionKey = `ui-e2e-${Date.now()}`;
    await page.fill("#coding-session", sessionKey);
    await page.fill("#coding-task", "reply with ONLY UIALPHA");
    await page.selectOption("#coding-mode", "persistent");
    await page.check("#coding-new");

    await page.click("#coding-form button[type='submit']");
    await page.waitForFunction(() => {
      const output = document.querySelector("#coding-output");
      return Boolean(output && output.textContent && output.textContent.includes("UIALPHA"));
    });

    const firstOutput = (await page.textContent("#coding-output")) ?? "";
    assert.equal(firstOutput.includes("UIALPHA"), true);

    await page.uncheck("#coding-new");
    await page.fill("#coding-task", "reply with ONLY UIBETA");
    await page.click("#coding-form button[type='submit']");

    await page.waitForFunction(() => {
      const output = document.querySelector("#coding-output");
      return Boolean(output && output.textContent && output.textContent.includes("UIBETA"));
    });

    const secondOutput = (await page.textContent("#coding-output")) ?? "";
    assert.equal(secondOutput.includes("UIBETA"), true);

    await page.click("#btn-sessions");
    await page.waitForFunction(() => {
      const output = document.querySelector("#coding-output");
      return Boolean(output && output.textContent && output.textContent.includes("Current coding_agent session"));
    });

    const sessionsOutput = (await page.textContent("#coding-output")) ?? "";
    assert.equal(sessionsOutput.includes("Current coding_agent session"), true);

    await page.click("#btn-reset");
    await page.waitForFunction(() => {
      const output = document.querySelector("#coding-output");
      return Boolean(output && output.textContent && output.textContent.toLowerCase().includes("cleared"));
    });

    const resetOutput = (await page.textContent("#coding-output")) ?? "";
    assert.equal(resetOutput.toLowerCase().includes("cleared"), true);
  } finally {
    await browser?.close();
    await stopChild(child);
  }
});
