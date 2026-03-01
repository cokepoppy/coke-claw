import { spawn } from "node:child_process";

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
  return await new Promise((resolve) => {
    const child = spawn("codex", args, {
      cwd,
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
        command: `codex ${args.join(" ")}`,
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
        command: `codex ${args.join(" ")}`,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        text: error.message,
        command: `codex ${args.join(" ")}`,
      });
    });
  });
}

function buildNewArgs(task: string): string[] {
  const modelFromEnv = process.env.CODEX_MODEL;
  const args = ["exec", "--skip-git-repo-check", "--json"];
  if (modelFromEnv) {
    args.push("--model", modelFromEnv);
  }
  args.push(task);
  return args;
}

function buildResumeArgs(threadId: string, task: string): string[] {
  const modelFromEnv = process.env.CODEX_MODEL;
  const args = ["exec", "resume", "--skip-git-repo-check", "--json", threadId];
  if (modelFromEnv) {
    args.push("--model", modelFromEnv);
  }
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
    const resumed = await runCodex(buildResumeArgs(params.threadId, task), params.cwd);
    if (resumed.ok) {
      return {
        text: resumed.text,
        threadId: params.threadId,
        resumed: true,
      };
    }

    const reason = [resumed.text, resumed.stderr].filter(Boolean).join("\n");
    const created = await runCodex(buildNewArgs(task), params.cwd);
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

  const created = await runCodex(buildNewArgs(task), params.cwd);
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
