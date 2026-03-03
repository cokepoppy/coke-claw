import { exec } from "node:child_process";
import path from "node:path";

function resolveCwd(workspaceRoot: string, rawCwd?: string): string {
  const input = rawCwd?.trim();
  if (!input || input === ".") {
    return path.resolve(workspaceRoot);
  }
  if (path.isAbsolute(input)) {
    return path.resolve(input);
  }
  return path.resolve(workspaceRoot, input);
}

export async function runMacCommand(
  workspaceRoot: string,
  command: string,
  timeoutMs = 20_000,
  cwd?: string,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
}> {
  if (process.platform !== "darwin") {
    throw new Error("mac_run is only available on macOS");
  }

  const resolvedCwd = resolveCwd(workspaceRoot, cwd);
  return await new Promise((resolve) => {
    exec(
      command,
      { cwd: resolvedCwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0, cwd: resolvedCwd });
          return;
        }
        const exitCode =
          typeof (error as NodeJS.ErrnoException).code === "number"
            ? Number((error as NodeJS.ErrnoException).code)
            : 1;
        resolve({ stdout, stderr: `${stderr}\n${error.message}`.trim(), exitCode, cwd: resolvedCwd });
      },
    );
  });
}
