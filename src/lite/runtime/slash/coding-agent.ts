import path from "node:path";
import { CodexSessionStore } from "../../acp/codex-session-store.js";
import { spawnCodexTask } from "../../acp/spawn-codex.js";

export interface ParsedCodingAgentArgs {
  action: "run" | "list" | "reset";
  task: string;
  cwd?: string;
  mode: "persistent" | "oneshot";
  forceNew: boolean;
}

export interface CodingAgentRunInput {
  task: string;
  cwd?: string;
  mode?: "persistent" | "oneshot";
  forceNew?: boolean;
}

function resolveCwd(workspaceRoot: string, rawPath: string): string {
  const input = rawPath.trim();
  if (!input || input === ".") {
    return path.resolve(workspaceRoot);
  }
  if (path.isAbsolute(input)) {
    return path.resolve(input);
  }
  return path.resolve(workspaceRoot, input);
}

export function parseCodingAgentArgs(input: string): ParsedCodingAgentArgs {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return {
      action: "list",
      task: "",
      mode: "persistent",
      forceNew: false,
    };
  }

  const first = tokens[0]?.toLowerCase();
  if (["sessions", "status", "list"].includes(first)) {
    return {
      action: "list",
      task: "",
      mode: "persistent",
      forceNew: false,
    };
  }

  if (["reset", "clear"].includes(first)) {
    return {
      action: "reset",
      task: "",
      mode: "persistent",
      forceNew: false,
    };
  }

  const taskTokens: string[] = [];
  let cwd: string | undefined;
  let mode: "persistent" | "oneshot" = "persistent";
  let forceNew = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--cwd") {
      cwd = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === "--mode") {
      const raw = tokens[i + 1];
      if (raw === "persistent" || raw === "oneshot") {
        mode = raw;
      }
      i += 1;
      continue;
    }
    if (token === "--new") {
      forceNew = true;
      continue;
    }
    taskTokens.push(token);
  }

  return {
    action: "run",
    task: taskTokens.join(" ").trim(),
    cwd,
    mode,
    forceNew,
  };
}

export function buildCodingAgentRawArgs(input: CodingAgentRunInput): string {
  const parts: string[] = [];
  const task = input.task.trim();
  if (!task) {
    return "";
  }
  parts.push(task);
  if (input.cwd?.trim()) {
    parts.push("--cwd", input.cwd.trim());
  }
  if (input.mode && input.mode !== "persistent") {
    parts.push("--mode", input.mode);
  }
  if (input.forceNew) {
    parts.push("--new");
  }
  return parts.join(" ");
}

export interface CodingAgentCommandRunner {
  run(rawArgs: string, sessionKey: string): Promise<string>;
}

export function createCodingAgentCommandRunner(workspaceRoot: string): CodingAgentCommandRunner {
  const store = new CodexSessionStore(workspaceRoot);

  return {
    async run(rawArgs: string, sessionKey: string): Promise<string> {
      const parsed = parseCodingAgentArgs(rawArgs);

      if (parsed.action === "list") {
        const record = store.get(sessionKey);
        if (!record) {
          return "No persistent coding_agent session for this chat. Run: /coding_agent <task>";
        }
        return [
          "Current coding_agent session:",
          `threadId: ${record.threadId}`,
          `cwd: ${record.cwd}`,
          `updatedAt: ${new Date(record.updatedAt).toISOString()}`,
        ].join("\n");
      }

      if (parsed.action === "reset") {
        const deleted = store.delete(sessionKey);
        return deleted
          ? "Cleared persistent coding_agent session for this chat."
          : "No persistent coding_agent session to clear.";
      }

      if (!parsed.task) {
        return "Usage: /coding_agent <task> [--cwd <path>] [--mode persistent|oneshot] [--new]";
      }

      const cwd = resolveCwd(workspaceRoot, parsed.cwd ?? ".");
      const saved = parsed.forceNew ? null : store.get(sessionKey);
      const resumeThreadId = parsed.mode === "persistent" ? saved?.threadId : undefined;

      const result = await spawnCodexTask({
        task: parsed.task,
        cwd,
        mode: parsed.mode,
        threadId: resumeThreadId,
      });

      if (parsed.mode === "persistent" && result.threadId) {
        store.set(sessionKey, result.threadId, cwd);
      }

      if (parsed.mode === "oneshot") {
        return result.text;
      }

      const threadId = result.threadId ?? resumeThreadId ?? "unknown";
      const stateText = result.resumed ? "resumed" : "new";
      return [`[coding_agent ${stateText} thread=${threadId}]`, result.text].join("\n\n");
    },
  };
}
