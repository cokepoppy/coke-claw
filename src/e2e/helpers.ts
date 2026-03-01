import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

export type AdminChild = ChildProcessByStdio<null, Readable, Readable>;

export function startAdminProcess(extraEnv?: Record<string, string>): AdminChild {
  return spawn("node", ["dist/lite/app.js", "admin"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_HOST: "127.0.0.1",
      ADMIN_PORT: "0",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function waitForAdminUrl(child: AdminChild, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for admin server URL"));
    }, timeoutMs);

    let combined = "";

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      combined += text;
      const match = combined.match(/Admin UI listening on (http:\/\/[^\s]+)/);
      if (match?.[1]) {
        cleanup();
        resolve(match[1]);
      }
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Admin process exited before ready (code=${code})\n${combined}`));
    };

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    }

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

export async function stopChild(child: AdminChild): Promise<void> {
  if (child.killed || child.exitCode != null) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
