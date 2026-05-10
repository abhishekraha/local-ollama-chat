const STORAGE_KEY = "ollama-chat-sessions-v1";
const LEGACY_STORAGE_KEY = "qwen-chat-sessions-v1";
const APP_VERSION = "20260510-3";

const messagesEl = document.querySelector("#messages");
const promptInput = document.querySelector("#promptInput");
const composer = document.querySelector("#composer");
const sendButton = document.querySelector("#sendButton");
const stopButton = document.querySelector("#stopButton");
const modelSelect = document.querySelector("#modelSelect");
const temperatureInput = document.querySelector("#temperatureInput");
const sessionsList = document.querySelector("#sessionsList");
const newChatButton = document.querySelector("#newChatButton");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const topStatusDot = document.querySelector("#topStatusDot");
const topStatusText = document.querySelector("#topStatusText");
const emptyStateTemplate = document.querySelector("#emptyStateTemplate");

let sessions = loadSessions();
let activeSessionId = sessions[0]?.id || createSession().id;
let abortController = null;
saveSessions();

init().catch((error) => {
  setConnectionStatus("offline", "App startup failed");
  console.error(error);
});

async function init() {
  document.documentElement.dataset.appVersion = APP_VERSION;
  renderSessions();
  renderMessages();
  await loadModels();

  composer.addEventListener("submit", handleSubmit);
  promptInput.addEventListener("input", resizePrompt);
  promptInput.addEventListener("keydown", handlePromptKeydown);
  stopButton.addEventListener("click", stopGeneration);
  newChatButton.addEventListener("click", () => {
    activeSessionId = createSession().id;
    saveSessions();
    renderSessions();
    renderMessages();
    promptInput.focus();
  });

}

async function loadModels() {
  try {
    const response = await fetch("/api/tags");
    const data = await response.json();
    modelSelect.innerHTML = "";
    const names = data.models?.length ? data.models : [data.defaultModel || "qwen2.5:7b"];

    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === (data.defaultModel || "qwen2.5:7b");
      modelSelect.append(option);
    }

    setConnectionStatus(data.offline ? "offline" : "online", data.offline ? "Ollama not reachable" : "Ollama connected");
  } catch {
    setConnectionStatus("offline", "Server offline");
  }
}

function setConnectionStatus(state, label) {
  if (statusDot) statusDot.className = `status-dot ${state}`;
  if (topStatusDot) topStatusDot.className = `status-dot ${state}`;
  if (statusText) statusText.textContent = label;
  if (topStatusText) topStatusText.textContent = label;
}

async function handleSubmit(event) {
  event.preventDefault();
  const content = promptInput.value.trim();
  if (!content || abortController) return;

  const session = getActiveSession();
  session.messages.push({ role: "user", content });
  session.title = session.title === "New chat" ? titleFrom(content) : session.title;

  promptInput.value = "";
  resizePrompt();
  renderSessions();
  renderMessages();
  saveSessions();

  await generateAssistantReply(session);
}

async function generateAssistantReply(session) {
  abortController = new AbortController();
  setBusy(true);

  const assistantMessage = { role: "assistant", content: "" };
  session.messages.push(assistantMessage);
  renderMessages();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelSelect.value || "qwen2.5:7b",
        temperature: temperatureInput.value,
        messages: session.messages
      }),
      signal: abortController.signal
    });

    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(detail.detail || detail.error || "The model request failed.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assistantMessage.content += decoder.decode(value, { stream: true });
      renderMessages({ stickToBottom: true });
      saveSessions();
    }

    if (!assistantMessage.content.trim()) {
      assistantMessage.content = "I did not receive any text from Ollama.";
    }
  } catch (error) {
    if (error.name === "AbortError") {
      assistantMessage.content += "\n\n[Stopped]";
    } else {
      assistantMessage.content = `I could not reach the local model.\n\n${error.message}`;
    }
  } finally {
    abortController = null;
    setBusy(false);
    saveSessions();
    renderMessages();
  }
}

function stopGeneration() {
  abortController?.abort();
}

function setBusy(isBusy) {
  sendButton.disabled = isBusy;
  stopButton.hidden = !isBusy;
  promptInput.disabled = isBusy;
}

function handlePromptKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
}

function resizePrompt() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 192)}px`;
}

function renderMessages(options = {}) {
  const session = getActiveSession();
  messagesEl.innerHTML = "";
  const inner = document.createElement("div");
  inner.className = "messages-inner";

  if (session.messages.length === 0) {
    inner.append(emptyStateTemplate.content.cloneNode(true));
    inner.querySelectorAll(".suggestions button").forEach((button) => {
      button.addEventListener("click", () => {
        promptInput.value = button.textContent.trim();
        resizePrompt();
        promptInput.focus();
      });
    });
  } else {
    for (const message of session.messages) {
      inner.append(renderMessage(message));
    }
  }

  messagesEl.append(inner);

  if (options.stickToBottom || isNearBottom(messagesEl)) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function renderMessage(message) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = renderMarkdown(message.content || "Thinking...");

  wrapper.append(avatar, bubble);
  return wrapper;
}

function renderSessions() {
  sessionsList.innerHTML = "";
  for (const session of sessions) {
    const button = document.createElement("button");
    button.className = `session-button ${session.id === activeSessionId ? "active" : ""}`;
    button.type = "button";
    button.textContent = session.title;
    button.title = session.title;
    button.addEventListener("click", () => {
      activeSessionId = session.id;
      renderSessions();
      renderMessages();
      promptInput.focus();
    });
    sessionsList.append(button);
  }
}

function createSession() {
  const session = {
    id: createId(),
    title: "New chat",
    createdAt: new Date().toISOString(),
    messages: []
  };
  sessions.unshift(session);
  return session;
}

function getActiveSession() {
  return sessions.find((session) => session.id === activeSessionId) || sessions[0] || createSession();
}

function loadSessions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "[]";
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)));
  } catch {
    // Private/mobile browser storage can fail; chat still works for the current page session.
  }
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleFrom(content) {
  return content.replace(/\s+/g, " ").slice(0, 48) || "New chat";
}

function isNearBottom(element) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 160;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMarkdown(markdown) {
  const escaped = escapeHtml(markdown);
  const blocks = escaped.split(/```/g);

  return blocks
    .map((block, index) => {
      if (index % 2 === 1) {
        const code = block.replace(/^[a-zA-Z0-9_-]+\n/, "");
        return `<pre><code>${code}</code></pre>`;
      }

      return block
        .split(/\n{2,}/)
        .map((paragraph) => {
          const withInlineCode = paragraph.replace(/`([^`]+)`/g, "<code>$1</code>");
          return `<p>${withInlineCode.replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
    })
    .join("");
}
