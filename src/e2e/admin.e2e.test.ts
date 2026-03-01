import test from "node:test";
import assert from "node:assert/strict";
import { startAdminProcess, stopChild, waitForAdminUrl } from "./helpers.js";

test("admin e2e: health/static/coding-agent session lifecycle", { timeout: 180_000 }, async () => {
  const child = startAdminProcess();

  try {
    const baseUrl = await waitForAdminUrl(child, 20_000);

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.ok, true);
    const healthPayload = (await healthRes.json()) as {
      ok: boolean;
      data: { service: string; workspaceRoot: string };
    };
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.data.service, "coke-claw-lite");
    assert.equal(typeof healthPayload.data.workspaceRoot, "string");

    const pageRes = await fetch(`${baseUrl}/`);
    assert.equal(pageRes.ok, true);
    const html = await pageRes.text();
    assert.equal(html.includes("Coke Claw Admin"), true);

    const sessionKey = `e2e:${Date.now()}`;

    const authStatusRes = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(authStatusRes.ok, true);
    const authStatus = (await authStatusRes.json()) as {
      ok: boolean;
      data: { codex: { loggedIn: boolean; text: string } };
    };
    assert.equal(authStatus.ok, true);
    assert.equal(typeof authStatus.data.codex.text, "string");

    const run1Res = await fetch(`${baseUrl}/api/coding-agent/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionKey,
        task: "reply with ONLY ALPHA",
        mode: "persistent",
        forceNew: true,
      }),
    });
    assert.equal(run1Res.ok, true);
    const run1 = (await run1Res.json()) as { ok: boolean; data: { text: string } };
    assert.equal(run1.ok, true);
    assert.equal(typeof run1.data.text, "string");
    assert.equal(run1.data.text.length > 0, true);

    const sessions1Res = await fetch(
      `${baseUrl}/api/coding-agent/sessions?prefix=${encodeURIComponent(sessionKey)}`,
    );
    assert.equal(sessions1Res.ok, true);
    const sessions1 = (await sessions1Res.json()) as {
      ok: boolean;
      data: Array<{ sessionKey: string; threadId: string; cwd: string; updatedAt: number }>;
    };
    assert.equal(sessions1.ok, true);
    assert.equal(sessions1.data.length, 1);
    assert.equal(sessions1.data[0]?.sessionKey, sessionKey);
    const firstThreadId = sessions1.data[0]?.threadId;
    assert.equal(typeof firstThreadId, "string");
    assert.equal(firstThreadId.length > 0, true);

    const run2Res = await fetch(`${baseUrl}/api/coding-agent/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionKey,
        task: "reply with ONLY BETA",
        mode: "persistent",
      }),
    });
    assert.equal(run2Res.ok, true);
    const run2 = (await run2Res.json()) as { ok: boolean; data: { text: string } };
    assert.equal(run2.ok, true);
    assert.equal(typeof run2.data.text, "string");
    assert.equal(run2.data.text.length > 0, true);

    const sessions2Res = await fetch(
      `${baseUrl}/api/coding-agent/sessions?prefix=${encodeURIComponent(sessionKey)}`,
    );
    assert.equal(sessions2Res.ok, true);
    const sessions2 = (await sessions2Res.json()) as {
      ok: boolean;
      data: Array<{ threadId: string }>;
    };
    assert.equal(sessions2.ok, true);
    assert.equal(sessions2.data.length, 1);
    assert.equal(sessions2.data[0]?.threadId, firstThreadId);

    const resetRes = await fetch(`${baseUrl}/api/coding-agent/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionKey,
        command: "reset",
      }),
    });
    assert.equal(resetRes.ok, true);
    const reset = (await resetRes.json()) as { ok: boolean; data: { text: string } };
    assert.equal(reset.ok, true);
    assert.equal(reset.data.text.toLowerCase().includes("clear"), true);

    const sessions3Res = await fetch(
      `${baseUrl}/api/coding-agent/sessions?prefix=${encodeURIComponent(sessionKey)}`,
    );
    assert.equal(sessions3Res.ok, true);
    const sessions3 = (await sessions3Res.json()) as {
      ok: boolean;
      data: Array<unknown>;
    };
    assert.equal(sessions3.ok, true);
    assert.equal(sessions3.data.length, 0);
  } finally {
    await stopChild(child);
  }
});
