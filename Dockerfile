FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OLLAMA_MODEL=qwen2.5:3b

COPY package.json server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
