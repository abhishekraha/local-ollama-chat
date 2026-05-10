# Qwen Chat

A local web chat app for `qwen2.5:7b` running through Ollama in Docker.

## Run Ollama

Expose Ollama on port `11434` from Docker, then pull the model:

```powershell
docker exec -it <ollama-container-name> ollama pull qwen2.5:7b
```

If you are starting a fresh Ollama container:

```powershell
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec -it ollama ollama pull qwen2.5:7b
```

## Start the chat app with Docker

This does not require Node.js on your laptop.

```powershell
docker compose up --build
```

Open:

```text
http://localhost:3000
```

To run it in the background:

```powershell
docker compose up --build -d
```

To stop it:

```powershell
docker compose down
```

## Start Ollama and chat together

Use this if you want Docker Compose to run Ollama, pull the models, and then start the chat app.

```powershell
docker compose -f docker-compose.ollama.yml up --build
```

This Compose file gives Ollama GPU access with:

```yaml
gpus: all
```

It also limits Ollama concurrency to reduce CPU/GPU pressure:

```yaml
OLLAMA_NUM_PARALLEL: "1"
OLLAMA_MAX_LOADED_MODELS: "1"
```

That works when Docker can see your NVIDIA GPU. If Docker reports a GPU-related error, update your NVIDIA driver / Docker Desktop GPU support, or remove `gpus: all` from `docker-compose.ollama.yml` to run CPU-only.

The first run will take a while because it downloads:

```text
qwen2.5:3b
qwen2.5-coder:3b
```

Open:

```text
http://localhost:8080
```

From your phone on Tailscale:

```text
http://<your-laptop-tailscale-ip>:8080
```

Run it in the background:

```powershell
docker compose -f docker-compose.ollama.yml up --build -d
```

Stop the full stack:

```powershell
docker compose -f docker-compose.ollama.yml down
```

The downloaded models are kept in the `ollama-data` Docker volume.

If you changed `docker-compose.yml` to publish another port such as `8080`, use that port instead:

```text
http://localhost:8080
```

## Open from a phone with Tailscale

Use your laptop's Tailscale IP or MagicDNS name with the published app port:

```text
http://<your-laptop-tailscale-ip>:3000
```

or, if your Compose file publishes `8080`:

```text
http://<your-laptop-tailscale-ip>:8080
```

The phone does not need direct access to Ollama. It only needs access to the chat app. The chat app container talks to Ollama through:

```text
http://host.docker.internal:11434
```

From your phone, open this diagnostic URL to check whether the chat app can reach Ollama:

```text
http://<your-laptop-tailscale-ip>:3000/api/diagnostics
```

Use port `8080` in that URL if your Compose file publishes `8080`.

## Start the chat app with Node

```powershell
node server.js
```

Open:

```text
http://localhost:3000
```

## Configuration

The app defaults to:

```text
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
PORT=3000
```

Inside Docker Compose, `OLLAMA_HOST` is set to:

```text
http://host.docker.internal:11434
```

That lets the chat container reach Ollama exposed on your laptop.

Override them when needed:

```powershell
$env:OLLAMA_HOST="http://localhost:11434"
$env:OLLAMA_MODEL="qwen2.5:7b"
$env:PORT="3000"
node server.js
```
