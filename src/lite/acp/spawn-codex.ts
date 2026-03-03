import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import fsp from "node:fs/promises";

export interface SpawnCodexParams {
  task: string;
  cwd?: string;
  mode?: "persistent" | "oneshot";
  threadId?: string;
}

interface CodexExecResult {
  ok: boolean;
  threadId?: string;
  text: string;
  stderr?: string;
  command: string;
}

function canExecute(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCodexBin(): string {
  const fromEnv = process.env.CODEX_BIN?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const home = process.env.HOME?.trim();
  const candidates = [
    home ? path.join(home, ".npm-global/bin/codex") : "",
    home ? path.join(home, ".local/bin/codex") : "",
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && canExecute(candidate)) {
      return candidate;
    }
  }

  return "codex";
}

function parseJsonLines(stdout: string): {
  threadId?: string;
  text: string;
} {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let threadId: string | undefined;
  const messageChunks: string[] = [];

  for (const line of lines) {
    try {
      const evt = JSON.parse(line) as Record<string, unknown>;
      if (evt.type === "thread.started" && typeof evt.thread_id === "string") {
        threadId = evt.thread_id;
      }
      if (evt.type === "item.completed") {
        const item = evt.item as Record<string, unknown> | undefined;
        if (item?.type === "agent_message" && typeof item.text === "string") {
          messageChunks.push(item.text);
        }
      }
    } catch {
      // Ignore non-json lines to keep parser resilient across CLI versions.
    }
  }

  return {
    threadId,
    text: messageChunks.join("\n\n").trim(),
  };
}

async function runCodex(args: string[], cwd?: string): Promise<CodexExecResult> {
  const resolvedCwd = cwd?.trim() ? path.resolve(cwd.trim()) : undefined;
  if (resolvedCwd) {
    await fsp.mkdir(resolvedCwd, { recursive: true });
  }
  const codexBin = resolveCodexBin();
  return await new Promise((resolve) => {
    const child = spawn(codexBin, args, {
      cwd: resolvedCwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];

    child.stdout.on("data", (chunk) => out.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => err.push(Buffer.from(chunk)));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        ok: false,
        text: "codex command timed out",
        command: `${codexBin} ${args.join(" ")}`,
      });
    }, 5 * 60 * 1000);

    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8").trim();
      const stderr = Buffer.concat(err).toString("utf8").trim();
      const parsed = parseJsonLines(stdout);
      const fallbackText = parsed.text || stdout || "(codex completed with no stdout)";

      resolve({
        ok: code === 0,
        threadId: parsed.threadId,
        text: fallbackText,
        stderr,
        command: `${codexBin} ${args.join(" ")}`,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      const extra =
        error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
          ? `\nHint: codex binary not found. Set CODEX_BIN to the absolute path (e.g. ${process.env.HOME ?? "~"}/.npm-global/bin/codex).`
          : "";
      resolve({
        ok: false,
        text: `${error.message}${extra}`,
        command: `${codexBin} ${args.join(" ")}`,
      });
    });
  });
}

function appendCommonOptions(args: string[], cwd?: string): string[] {
  const sandbox = (process.env.CODEX_SANDBOX ?? "danger-full-access").trim();
  if (sandbox === "read-only" || sandbox === "workspace-write" || sandbox === "danger-full-access") {
    args.push("--sandbox", sandbox);
  }

  const modelFromEnv = process.env.CODEX_MODEL?.trim();
  if (modelFromEnv) {
    args.push("--model", modelFromEnv);
  }

  const cwdFromArg = cwd?.trim();
  if (cwdFromArg) {
    args.push("--cd", cwdFromArg);
  }
  return args;
}

function buildNewArgs(task: string, cwd?: string): string[] {
  const args = ["exec", "--skip-git-repo-check", "--json"];
  appendCommonOptions(args, cwd);
  args.push(task);
  return args;
}

function buildResumeArgs(threadId: string, task: string, cwd?: string): string[] {
  const args = ["exec", "resume", "--skip-git-repo-check", "--json", threadId];
  appendCommonOptions(args, cwd);
  args.push(task);
  return args;
}

export async function spawnCodexTask(
  params: SpawnCodexParams,
): Promise<{ text: string; threadId?: string; resumed: boolean }> {
  const task = params.task.trim();
  if (!task) {
    throw new Error("/coding_agent needs a task");
  }

  if (params.mode === "persistent" && params.threadId) {
    const resumed = await runCodex(buildResumeArgs(params.threadId, task, params.cwd), params.cwd);
    if (resumed.ok) {
      return {
        text: resumed.text,
        threadId: params.threadId,
        resumed: true,
      };
    }

    const reason = [resumed.text, resumed.stderr].filter(Boolean).join("\n");
    const created = await runCodex(buildNewArgs(task, params.cwd), params.cwd);
    if (created.ok) {
      return {
        text: `Previous thread resume failed and a new thread was created.\nReason: ${reason}\n\n${created.text}`,
        threadId: created.threadId,
        resumed: false,
      };
    }

    return {
      text:
        "Failed to invoke codex CLI.\n" +
        `${resumed.command} => ${reason}\n\n` +
        `${created.command} => ${[created.text, created.stderr].filter(Boolean).join("\n")}`,
      resumed: false,
    };
  }

  const created = await runCodex(buildNewArgs(task, params.cwd), params.cwd);
  if (created.ok) {
    return {
      text: created.text,
      threadId: created.threadId,
      resumed: false,
    };
  }

  return {
    text:
      "Failed to invoke codex CLI.\n" +
      `${created.command} => ${[created.text, created.stderr].filter(Boolean).join("\n")}`,
    resumed: false,
  };
}
