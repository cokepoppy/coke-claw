import readline from "node:readline";
import { LiteConfig } from "../config.js";
import { createRouter } from "../runtime/router.js";

export async function startConsole(config: LiteConfig): Promise<void> {
  const router = createRouter(config);
  let closed = false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "coke-claw-lite> ",
  });

  console.log("Console started. Type /help or any message. Ctrl+C to exit.");
  rl.prompt();

  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    try {
      const result = await router.route({
        text,
        sessionKey: "console:local",
        channel: "console",
      });
      console.log(`\n${result}\n`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }

    if (!closed) {
      rl.prompt();
    }
  });

  await new Promise<void>((resolve) => {
    rl.on("close", () => {
      closed = true;
      resolve();
    });
  });
}
