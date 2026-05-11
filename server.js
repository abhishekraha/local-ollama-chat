import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const ollamaHost = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const defaultModel = process.env.OLLAMA_MODEL || "deepseek-coder:6.7b";
const allowedModels = (process.env.OLLAMA_MODELS || "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch {
    const fallback = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": mimeTypes[".html"], "cache-control": "no-store" });
    res.end(fallback);
  }
}

async function proxyChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    sendJson(res, 400, { error: "At least one message is required." });
    return;
  }

  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const upstream = await fetch(`${ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: body.model || defaultModel,
        messages,
        stream: true,
        options: {
          temperature: Number(body.temperature ?? 0.7),
          top_p: Number(body.top_p ?? 0.9),
          num_ctx: Number(body.num_ctx ?? 8192)
        }
      }),
      signal: controller.signal
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      sendJson(res, upstream.status || 502, {
        error: "Ollama returned an error.",
        detail: text || upstream.statusText
      });
      return;
    }

    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no"
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.message?.content) res.write(event.message.content);
          if (event.done) res.end();
        } catch {
          res.write(line);
        }
      }
    }

    if (!res.writableEnded) res.end();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: "Could not reach Ollama.",
        detail: `Tried ${ollamaHost}. Make sure Docker exposes Ollama on port 11434 and ${defaultModel} is pulled.`
      });
    } else {
      res.end();
    }
  }
}

async function listModels(res) {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`);
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    const installedModels = (data.models || []).map((model) => model.name);
    const visibleModels = allowedModels.length
      ? allowedModels.filter((model) => installedModels.includes(model))
      : installedModels;

    sendJson(res, 200, {
      defaultModel,
      models: visibleModels.length ? visibleModels : [defaultModel],
      installedModels
    });
  } catch {
    sendJson(res, 200, { defaultModel, models: [defaultModel], offline: true });
  }
}

async function diagnose(res) {
  const startedAt = Date.now();
  const result = {
    ok: true,
    checkedAt: new Date().toISOString(),
    port,
    ollamaHost,
    defaultModel,
    ollama: {
      reachable: false,
      models: []
    }
  };

  try {
    const response = await fetch(`${ollamaHost}/api/tags`);
    result.ollama.status = response.status;
    if (!response.ok) throw new Error(response.statusText);

    const data = await response.json();
    result.ollama.reachable = true;
    result.ollama.models = (data.models || []).map((model) => model.name);
    result.visibleModels = allowedModels.length
      ? allowedModels.filter((model) => result.ollama.models.includes(model))
      : result.ollama.models;
    result.ollama.hasDefaultModel = result.ollama.models.includes(defaultModel);
  } catch (error) {
    result.ok = false;
    result.ollama.error = error.message;
  }

  result.latencyMs = Date.now() - startedAt;
  sendJson(res, result.ok ? 200 : 502, result);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/tags") {
    await listModels(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/diagnostics") {
    await diagnose(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, ollamaHost, defaultModel });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await proxyChat(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(port, () => {
  console.log(`Chat app: http://localhost:${port}`);
  console.log(`Ollama:   ${ollamaHost}`);
  console.log(`Model:    ${defaultModel}`);
  if (allowedModels.length) console.log(`Visible:  ${allowedModels.join(", ")}`);
});
