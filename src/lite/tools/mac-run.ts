import { exec } from "node:child_process";

export async function runMacCommand(command: string, timeoutMs = 20_000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  if (process.platform !== "darwin") {
    throw new Error("mac_run is only available on macOS");
  }

  return await new Promise((resolve) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      const exitCode = typeof (error as NodeJS.ErrnoException).code === "number" ? Number((error as NodeJS.ErrnoException).code) : 1;
      resolve({ stdout, stderr: `${stderr}\n${error.message}`.trim(), exitCode });
    });
  });
}
