import test from "node:test";
import assert from "node:assert/strict";
import { parseDeviceLoginOutput } from "../lite/auth/codex-login.js";

test("parseDeviceLoginOutput extracts url and code", () => {
  const input = `
Open this link:
https://auth.openai.com/codex/device

Code:
7J8M-7DWGT
`;

  const parsed = parseDeviceLoginOutput(input);
  assert.equal(parsed.url, "https://auth.openai.com/codex/device");
  assert.equal(parsed.code, "7J8M-7DWGT");
});

test("parseDeviceLoginOutput handles missing values", () => {
  const parsed = parseDeviceLoginOutput("no device auth output");
  assert.equal(parsed.url, undefined);
  assert.equal(parsed.code, undefined);
});
