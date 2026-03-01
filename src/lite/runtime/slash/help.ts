export function helpText(): string {
  return [
    "Available commands:",
    "/help - Show this message",
    "/auth status|login - Check/start codex login",
    "/coding_agent <task> [--cwd <path>] [--mode persistent|oneshot] [--new] - Call codex",
    "/coding_agent sessions - Show current persistent codex session",
    "/coding_agent reset - Clear current persistent codex session",
  ].join("\n");
}
