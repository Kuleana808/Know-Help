FROM node:20-alpine AS base

# ── Stage 1: Build backend ──────────────────────────────────────────────────

FROM base AS backend-build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Build frontend ────────────────────────────────────────────────

FROM base AS frontend-build
WORKDIR /app/web

COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ── Stage 3: Production image ──────────────────────────────────────────────

FROM base AS production
WORKDIR /app

# Copy backend
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=backend-build /app/dist/ ./dist/
COPY scripts/ ./scripts/
COPY knowledge/ ./knowledge/
COPY knowledge.config.json ./
COPY registry/ ./registry/

# Copy frontend
COPY --from=frontend-build /app/web/.next ./web/.next
COPY --from=frontend-build /app/web/public ./web/public
COPY --from=frontend-build /app/web/package.json ./web/package.json
COPY --from=frontend-build /app/web/next.config.js ./web/next.config.js
COPY --from=frontend-build /app/web/node_modules ./web/node_modules

# Create persistent data directory
RUN mkdir -p /data

# Environment variables
ENV PORT=3000
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV ALLOWED_ORIGINS=https://know.help,http://localhost:3000,http://localhost:8080

EXPOSE 3000 8080

# Start script: run API server (includes WebSocket MCP)
CMD ["node", "dist/waitlist/server.js"]
