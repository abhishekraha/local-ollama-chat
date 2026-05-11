FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OLLAMA_MODEL=deepseek-coder:6.7b

COPY package.json server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
