const el = {
  badgeAuth: document.getElementById("badge-auth"),
  badgeUptime: document.getElementById("badge-uptime"),
  healthKv: document.getElementById("health-kv"),
  refreshBtn: document.getElementById("btn-refresh"),
  authStatusBtn: document.getElementById("btn-auth-status"),
  authLoginBtn: document.getElementById("btn-auth-login"),
  authOutput: document.getElementById("auth-output"),
  codingForm: document.getElementById("coding-form"),
  codingSession: document.getElementById("coding-session"),
  codingMode: document.getElementById("coding-mode"),
  codingCwd: document.getElementById("coding-cwd"),
  codingTask: document.getElementById("coding-task"),
  codingNew: document.getElementById("coding-new"),
  codingOutput: document.getElementById("coding-output"),
  sessionsBtn: document.getElementById("btn-sessions"),
  resetBtn: document.getElementById("btn-reset"),
  sessionsBody: document.getElementById("sessions-body"),
  chatForm: document.getElementById("chat-form"),
  chatSession: document.getElementById("chat-session"),
  chatText: document.getElementById("chat-text"),
  chatOutput: document.getElementById("chat-output"),
};

function setOutput(node, text, isError = false) {
  node.textContent = text;
  node.classList.toggle("error", isError);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload.data;
}

function renderHealth(data) {
  const entries = [
    ["service", data.service],
    ["now", data.now],
    ["workspace", data.workspaceRoot],
    ["model", data.modelRef],
    ["login mode", data.codexLoginMode],
    ["telegram", data.telegramEnabled ? "enabled" : "disabled"],
  ];

  el.healthKv.innerHTML = entries
    .map(([k, v]) => `<dt>${k}</dt><dd>${String(v)}</dd>`)
    .join("");

  const auth = data.auth?.ok ? `ok (${data.auth.source})` : `missing (${data.auth?.message || "unknown"})`;
  el.badgeAuth.textContent = `Auth: ${auth}`;
  el.badgeUptime.textContent = `Uptime: ${data.uptimeSec}s`;
}

function renderSessions(records) {
  if (!records.length) {
    el.sessionsBody.innerHTML = `<tr><td class="empty" colspan="4">No persistent coding sessions yet.</td></tr>`;
    return;
  }

  el.sessionsBody.innerHTML = records
    .map(
      (item) =>
        `<tr>
          <td>${item.sessionKey}</td>
          <td>${item.threadId}</td>
          <td>${item.cwd}</td>
          <td>${new Date(item.updatedAt).toLocaleString()}</td>
        </tr>`,
    )
    .join("");
}

async function refreshAll() {
  try {
    const [health, sessions] = await Promise.all([
      api("/api/health"),
      api("/api/coding-agent/sessions"),
    ]);
    renderHealth(health);
    renderSessions(sessions);
  } catch (error) {
    setOutput(el.chatOutput, error instanceof Error ? error.message : String(error), true);
  }
}

el.refreshBtn.addEventListener("click", () => {
  void refreshAll();
});

el.authStatusBtn.addEventListener("click", async () => {
  try {
    setOutput(el.authOutput, "Checking auth status...", false);
    const data = await api("/api/auth/status");
    const text = [
      `Codex login: ${data.codex?.loggedIn ? "logged-in" : "not-logged-in"}`,
      `Codex status output: ${data.codex?.text || "unknown"}`,
      `Model auth: ${
        data.modelAuth?.ok ? `ok (${data.modelAuth.source})` : `missing (${data.modelAuth?.message || "unknown"})`
      }`,
    ].join("\n");
    setOutput(el.authOutput, text, false);
  } catch (error) {
    setOutput(el.authOutput, error instanceof Error ? error.message : String(error), true);
  }
});

el.authLoginBtn.addEventListener("click", async () => {
  try {
    setOutput(el.authOutput, "Starting codex device login...", false);
    const data = await api("/api/auth/login", { method: "POST", body: "{}" });
    const text = [
      "Codex device login initialized.",
      data.url ? `Open URL: ${data.url}` : "",
      data.code ? `Code: ${data.code}` : "",
      "After completing browser login, click Auth Status.",
      !data.url || !data.code ? `Raw output:\n${data.text || ""}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    setOutput(el.authOutput, text, false);
  } catch (error) {
    setOutput(el.authOutput, error instanceof Error ? error.message : String(error), true);
  }
});

el.codingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setOutput(el.codingOutput, "Running...", false);
    const data = await api("/api/coding-agent/run", {
      method: "POST",
      body: JSON.stringify({
        sessionKey: el.codingSession.value.trim(),
        task: el.codingTask.value,
        mode: el.codingMode.value,
        cwd: el.codingCwd.value.trim(),
        forceNew: el.codingNew.checked,
      }),
    });
    setOutput(el.codingOutput, data.text, false);
    await refreshAll();
  } catch (error) {
    setOutput(el.codingOutput, error instanceof Error ? error.message : String(error), true);
  }
});

el.sessionsBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/coding-agent/command", {
      method: "POST",
      body: JSON.stringify({
        sessionKey: el.codingSession.value.trim(),
        command: "sessions",
      }),
    });
    setOutput(el.codingOutput, data.text, false);
    await refreshAll();
  } catch (error) {
    setOutput(el.codingOutput, error instanceof Error ? error.message : String(error), true);
  }
});

el.resetBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/coding-agent/command", {
      method: "POST",
      body: JSON.stringify({
        sessionKey: el.codingSession.value.trim(),
        command: "reset",
      }),
    });
    setOutput(el.codingOutput, data.text, false);
    await refreshAll();
  } catch (error) {
    setOutput(el.codingOutput, error instanceof Error ? error.message : String(error), true);
  }
});

el.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setOutput(el.chatOutput, "Sending...", false);
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionKey: el.chatSession.value.trim(),
        text: el.chatText.value,
      }),
    });
    setOutput(el.chatOutput, data.text, false);
  } catch (error) {
    setOutput(el.chatOutput, error instanceof Error ? error.message : String(error), true);
  }
});

void refreshAll();
setInterval(() => {
  void refreshAll();
}, 15000);
