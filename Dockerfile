FROM node:20-slim

# Required for native modules: tree-sitter, better-sqlite3, @ast-grep/napi
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ git curl ca-certificates zstd \
  && rm -rf /var/lib/apt/lists/*

# Install Ollama binary via official install script
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

EXPOSE 5174

CMD ["npx", "tsx", "src/server/index.ts"]
