# Astro static site served by `serve`
# Railway config: Root Directory = site/

# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /app/dist/ dist/

ENV PORT=3000
EXPOSE 3000

CMD ["serve", "dist", "-s", "-l", "tcp://0.0.0.0:3000"]
