# Ollama Chat

A local web chat app for any model running through Ollama in Docker.

## Run Ollama

Expose Ollama on port `11434` from Docker, then pull whichever model you want to use:

```powershell
docker exec -it <ollama-container-name> ollama pull <model-name>
```

If you are starting a fresh Ollama container:

```powershell
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec -it ollama ollama pull qwen2.5:3b
```

## Start the chat app with Docker

Use this when Ollama is already running separately on your machine. This does not require Node.js on your laptop.

```powershell
docker compose -f docker-compose.ollama-chat.yml up --build
```

Open:

```text
http://localhost:3000
```

To run it in the background:

```powershell
docker compose -f docker-compose.ollama-chat.yml up --build -d
```

To stop it:

```powershell
docker compose -f docker-compose.ollama-chat.yml down
```

## Start Ollama and chat together

Use this if you want Docker Compose to run Ollama, pull the models, and then start the chat app.

```powershell
docker compose -f docker-compose.ollama-chat-stack.yml up --build
```

### GPU and load limits

The full-stack Compose file starts Ollama with GPU access:

```yaml
gpus: all
```

This is the Compose equivalent of:

```powershell
docker run --gpus=all ollama/ollama
```

It also applies these Ollama settings:

```yaml
OLLAMA_NUM_PARALLEL: "1"
OLLAMA_MAX_LOADED_MODELS: "1"
```

What they do:

- `OLLAMA_NUM_PARALLEL=1` lets Ollama process one generation request at a time.
- `OLLAMA_MAX_LOADED_MODELS=1` keeps only one model loaded at once.

These settings reduce CPU/GPU pressure and help prevent the machine from getting overloaded when multiple chats or models are used. They do not force CPU-only mode; with `gpus: all`, Ollama can still use your NVIDIA GPU.

GPU support works when Docker can see your NVIDIA GPU. If Docker reports a GPU-related error, update your NVIDIA driver / Docker Desktop GPU support, or remove `gpus: all` from `docker-compose.ollama-chat-stack.yml` to run CPU-only.

The Ollama service is configured like this:

```yaml
ollama:
  image: ollama/ollama:latest
  gpus: all
  environment:
    OLLAMA_NUM_PARALLEL: "1"
    OLLAMA_MAX_LOADED_MODELS: "1"
    NVIDIA_VISIBLE_DEVICES: all
    NVIDIA_DRIVER_CAPABILITIES: compute,utility
  volumes:
    - ollama-data:/root/.ollama
```

The first run will take a while because this sample stack downloads:

```text
qwen2.5:3b
qwen2.5-coder:3b
```

Open:

```text
http://localhost:3000
```

Run it in the background:

```powershell
docker compose -f docker-compose.ollama-chat-stack.yml up --build -d
```

Stop the full stack:

```powershell
docker compose -f docker-compose.ollama-chat-stack.yml down
```

The downloaded models are kept in the `ollama-data` Docker volume.

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

In the chat-only Docker Compose file, `OLLAMA_HOST` is set to:

```text
http://host.docker.internal:11434
```

That lets the chat container reach Ollama exposed on your laptop.

In the full-stack Docker Compose file, `OLLAMA_HOST` is set to:

```text
http://ollama:11434
```

That lets the chat container reach the Ollama service inside the same Compose network.

Override them when needed:

```powershell
$env:OLLAMA_HOST="http://localhost:11434"
$env:OLLAMA_MODEL="qwen2.5:7b"
$env:PORT="3000"
node server.js
```
