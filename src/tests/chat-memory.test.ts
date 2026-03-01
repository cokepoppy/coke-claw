import test from "node:test";
import assert from "node:assert/strict";
import { ChatMemoryStore } from "../lite/runtime/chat-memory.js";

test("ChatMemoryStore stores ordered turns", () => {
  const memory = new ChatMemoryStore({ maxMessages: 10, maxChars: 1000 });
  memory.append("s1", { role: "user", content: "hello" });
  memory.append("s1", { role: "assistant", content: "hi" });

  const list = memory.list("s1");
  assert.equal(list.length, 2);
  assert.equal(list[0]?.role, "user");
  assert.equal(list[1]?.role, "assistant");
});

test("ChatMemoryStore trims by maxMessages and maxChars", () => {
  const memory = new ChatMemoryStore({ maxMessages: 3, maxChars: 8 });
  memory.append("s1", { role: "user", content: "1234" });
  memory.append("s1", { role: "assistant", content: "5678" });
  memory.append("s1", { role: "user", content: "90" });

  const list = memory.list("s1");
  const combined = list.map((x) => x.content).join("");

  assert.equal(list.length <= 3, true);
  assert.equal(combined.length <= 8, true);
  assert.equal(combined.endsWith("90"), true);
});
