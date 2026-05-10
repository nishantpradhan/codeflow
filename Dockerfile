FROM node:20-slim

# Required for native modules: tree-sitter, better-sqlite3, @ast-grep/napi
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

EXPOSE 5174

CMD ["npx", "tsx", "src/server/index.ts"]
