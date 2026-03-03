import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fsCreateFile, fsReadText, fsSearchFiles } from "../lite/tools/fs-tools.js";
import { runMacCommand } from "../lite/tools/mac-run.js";

test("fs_create_file + fs_read_text + fs_search_files work in workspace", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-tools-test-"));

  const created = await fsCreateFile(workspace, "src/demo/hello.txt", "hello world");
  assert.equal(created.created, true);

  const text = await fsReadText(workspace, "src/demo/hello.txt");
  assert.equal(text, "hello world");

  const search = await fsSearchFiles(workspace, "hello");
  assert.equal(search.matches.includes("src/demo/hello.txt"), true);
});

test("fs_create_file rejects existing file unless overwrite=true", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-tools-test-"));
  await fsCreateFile(workspace, "a.txt", "first");

  await assert.rejects(async () => {
    await fsCreateFile(workspace, "a.txt", "second");
  });

  const overwritten = await fsCreateFile(workspace, "a.txt", "second", true);
  assert.equal(overwritten.created, false);
  const text = await fsReadText(workspace, "a.txt");
  assert.equal(text, "second");
});

test("fs tools allow absolute paths outside workspace", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-tools-test-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "coke-tools-outside-"));
  const target = path.join(outside, "note.txt");

  const created = await fsCreateFile(workspace, target, "outside");
  assert.equal(created.path, target);
  const text = await fsReadText(workspace, target);
  assert.equal(text, "outside");
});

test("mac_run executes in workspace and allows cwd outside workspace", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-tools-test-"));
  fs.mkdirSync(path.join(workspace, "sub"), { recursive: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "coke-tools-outside-"));

  if (process.platform !== "darwin") {
    await assert.rejects(async () => {
      await runMacCommand(workspace, "pwd");
    });
    return;
  }

  const result = await runMacCommand(workspace, "pwd", 5000, "sub");
  assert.equal(result.exitCode, 0);
  assert.equal(fs.realpathSync(result.stdout.trim()), fs.realpathSync(path.join(workspace, "sub")));

  const outsideResult = await runMacCommand(workspace, "pwd", 5000, outside);
  assert.equal(outsideResult.exitCode, 0);
  assert.equal(fs.realpathSync(outsideResult.stdout.trim()), fs.realpathSync(outside));
});
