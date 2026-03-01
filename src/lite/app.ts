import { loadConfig } from "./config.js";
import { startTelegram } from "./channels/telegram/monitor.js";
import { startConsole } from "./console/cli.js";
import { startAdminServer } from "./admin/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const mode = process.argv[2] ?? "telegram";

  if (mode === "console") {
    await startConsole(config);
    return;
  }

  if (mode === "admin") {
    await startAdminServer(config);
    return;
  }

  if (mode === "both") {
    await Promise.all([startTelegram(config), startConsole(config)]);
    return;
  }

  if (mode === "telegram-admin") {
    await Promise.all([startTelegram(config), startAdminServer(config)]);
    return;
  }

  if (mode === "all") {
    await Promise.all([startTelegram(config), startConsole(config), startAdminServer(config)]);
    return;
  }

  await startTelegram(config);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
