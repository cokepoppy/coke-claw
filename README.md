# coke-claw-lite

Minimal OpenClaw-style implementation focused on:

- Telegram only
- OpenAI/OpenAI-Codex model only
- Mac file + browser tools
- `/coding_agent` slash command for Codex CLI
- Lightweight console mode
- Lightweight browser admin page
- In-memory multi-turn chat context per session

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Run Telegram mode

```bash
npm run dev:telegram
```

4. Run local console mode

```bash
npm run dev:console
```

5. Run browser admin page

```bash
npm run dev:admin
```

Open `http://127.0.0.1:3187/` (or `ADMIN_HOST`/`ADMIN_PORT`).

6. Run end-to-end tests

```bash
npm run test:e2e
```

7. Run UI browser e2e only

```bash
npm run test:e2e:ui
```

## Notes

- Auth priority: `OPENAI_API_KEY` -> Codex CLI login state (`~/.codex/auth.json` / macOS Keychain).
- `/coding_agent` shells out to `codex exec` and supports persistent session resume per chat.
- Telegram native command menu is registered on startup (`/start`, `/help`, `/coding_agent`).
- Commands: `/coding_agent <task>`, `/coding_agent <task> --mode oneshot`, `/coding_agent sessions`, `/coding_agent reset`.
- Auth commands: `/auth status`, `/auth login` (device-code OAuth, no API key required).
- Default auth preference is Codex login state (`codex login` / `codex login --device-auth`), then `OPENAI_API_KEY` fallback.
- Admin page sections: health/status, coding_agent run/reset/sessions, persistent sessions table, debug chat.
- Browser tool uses Playwright.
