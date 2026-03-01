import { execFile, spawn } from "node:child_process";

export interface CodexLoginStatus {
  loggedIn: boolean;
  text: string;
}

export interface CodexDeviceLoginStart {
  text: string;
  url?: string;
  code?: string;
}

export function parseDeviceLoginOutput(text: string): { url?: string; code?: string } {
  const urlMatch = text.match(/https:\/\/[^\s]+/i);
  const codeMatch = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5,}\b/);
  return {
    url: urlMatch?.[0],
    code: codeMatch?.[0],
  };
}

export async function getCodexLoginStatus(): Promise<CodexLoginStatus> {
  return await new Promise((resolve) => {
    execFile("codex", ["login", "status"], { timeout: 8000, encoding: "utf8" }, (error, stdout, stderr) => {
      const text = `${stdout ?? ""}${stderr ?? ""}`.trim();
      if (error) {
        resolve({ loggedIn: false, text: text || String(error.message || error) });
        return;
      }
      resolve({
        loggedIn: /logged\s+in/i.test(text),
        text: text || "unknown",
      });
    });
  });
}

export async function startCodexDeviceLogin(options?: { timeoutMs?: number }): Promise<CodexDeviceLoginStart> {
  const timeoutMs = options?.timeoutMs ?? 15_000;

  return await new Promise((resolve) => {
    const child = spawn("codex", ["login", "--device-auth"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;

    const finish = (forceKill = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (forceKill && child.exitCode == null && !child.killed) {
        child.kill("SIGTERM");
      }
      const text = `${Buffer.concat(out).toString("utf8")}\n${Buffer.concat(err).toString("utf8")}`.trim();
      const parsed = parseDeviceLoginOutput(text);
      resolve({ text: text || "No output from codex login", ...parsed });
    };

    const maybeEarlyFinish = () => {
      const text = `${Buffer.concat(out).toString("utf8")}\n${Buffer.concat(err).toString("utf8")}`;
      const parsed = parseDeviceLoginOutput(text);
      if (parsed.url && parsed.code) {
        finish(true);
      }
    };

    child.stdout.on("data", (chunk) => {
      out.push(Buffer.from(chunk));
      maybeEarlyFinish();
    });

    child.stderr.on("data", (chunk) => {
      err.push(Buffer.from(chunk));
      maybeEarlyFinish();
    });

    child.on("error", () => finish(false));
    child.on("close", () => finish(false));

    const timer = setTimeout(() => finish(true), timeoutMs);
  });
}
