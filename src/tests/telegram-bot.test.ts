import test from "node:test";
import assert from "node:assert/strict";
import { telegramNativeCommands } from "../lite/channels/telegram/bot.js";

test("telegram native commands include required slash commands", () => {
  const commands = telegramNativeCommands();
  const names = commands.map((c) => c.command);

  assert.equal(names.includes("start"), true);
  assert.equal(names.includes("help"), true);
  assert.equal(names.includes("coding_agent"), true);
});
