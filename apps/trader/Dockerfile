# Build context: repo root (not apps/trader/)
# Railway config: Root Directory = / , Dockerfile Path = apps/trader/Dockerfile

# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

# 1) Install root SDK dependencies (all, including dev — needed for tsc)
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build root SDK (trader depends on it via file:../..)
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# 3) Install trader app dependencies (all, including dev — needed for vite/tsc)
#    npm resolves file:../.. → /app (the built SDK)
COPY apps/trader/package.json apps/trader/package-lock.json apps/trader/
WORKDIR /app/apps/trader
RUN npm ci

# 4) Copy trader source and build (server + web)
COPY apps/trader/server/ server/
COPY apps/trader/web/ web/
COPY apps/trader/shared/ shared/
COPY apps/trader/vite.config.ts apps/trader/tsconfig.json ./
RUN npm run build

# 5) Prune to production-only dependencies
RUN npm prune --omit=dev
WORKDIR /app
RUN npm prune --omit=dev

# 6) Strip source maps from SDK dist
RUN find dist/ -name '*.map' -delete 2>/dev/null; true

# ── Stage 2: Production ────────────────────────────────────────────
FROM node:20-alpine AS runner

# Non-root user for defense in depth
RUN addgroup -S trader && adduser -S trader -G trader

WORKDIR /app

# Root SDK package + dist (symlink target for hyperliquid-prime)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/

# Trader app: built server + built web SPA + production deps only
WORKDIR /app/apps/trader
COPY --from=builder /app/apps/trader/package.json ./
COPY --from=builder /app/apps/trader/node_modules/ node_modules/
COPY --from=builder /app/apps/trader/server/dist/ server/dist/
COPY --from=builder /app/apps/trader/dist/ dist/

# Volume mount point for persistent data (Railway Volume)
RUN mkdir -p /data && chown trader:trader /data

ENV NODE_ENV=production
ENV TRADER_DATA_DIR=/data
EXPOSE 4400

USER trader
CMD ["node", "server/dist/server/src/index.js"]
