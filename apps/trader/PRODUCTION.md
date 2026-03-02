# Production Deployment (Railway)

## Domain layout

| Domain | Railway service | What it runs |
|---|---|---|
| `hlprime.xyz` | **site** | Astro static landing page (`site/`) |
| `app.hlprime.xyz` | **trader** | Express API + React SPA (`apps/trader/`) |

## Railway project setup

One Railway project, two services connected to the same GitHub repo:

### Service 1 — Trader (`app.hlprime.xyz`)

- **Dockerfile path**: `apps/trader/Dockerfile`
- **Root directory**: `/` (repo root — required because of the `file:../..` SDK dep)
- **Custom domain**: `app.hlprime.xyz` (CNAME to Railway)
- **Volume**: mount at `/data`, set `TRADER_DATA_DIR=/data`
- **Watch paths**: `apps/trader/**`, `src/**`, `package.json`

### Service 2 — Landing site (`hlprime.xyz`)

- **Root directory**: `site/`
- **Dockerfile path**: `site/Dockerfile` (relative to repo root) or just `Dockerfile` (relative to root dir)
- **Custom domain**: `hlprime.xyz` (CNAME to Railway)
- **No volume needed** (static site, no persistent state)
- **Watch paths**: `site/**`

## Trader environment variables

```env
NODE_ENV=production
TRADER_HOST=0.0.0.0
TRADER_PORT=4400
TRADER_DATA_DIR=/data
TRADER_STORE_PASSPHRASE=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
TRADER_APP_PASSWORD=<strong password>
TRADER_APP_PASSWORD_TTL_DAYS=7
TRADER_AUTH_ENABLED=true
TRADER_DEV_INSECURE=false
TRADER_ALLOWED_ORIGINS=https://app.hlprime.xyz
TRADER_SIGNER_BACKEND=local
TRADER_RUNTIME_STATE_BACKEND=sqlite
TRADER_DEFAULT_NETWORK=mainnet
TRADER_BUILDER_ADDRESS=0x34411c9d3c312e6ECb32C079AA0F34B572Dddc37
TRADER_BUILDER_FEE_BPS=1
```

## DNS (Cloudflare or registrar)

| Record | Type | Value |
|---|---|---|
| `hlprime.xyz` | CNAME | `<railway-site-service>.up.railway.app` |
| `app.hlprime.xyz` | CNAME | `<railway-trader-service>.up.railway.app` |

Railway auto-provisions TLS for custom domains.

## Runtime model
- Trader deploys as a single Railway service (API + static web from one domain).
- Mount a Railway Volume and set `TRADER_DATA_DIR` to that mount path.
- Bind the server with `TRADER_HOST=0.0.0.0` on Railway.

## App password gate
- Set `TRADER_APP_PASSWORD` to a strong secret before startup (server fails to boot when missing).
- Landing routes (`/`, `/v2`) plus unlock route (`/unlock`) remain public.
- All other SPA routes and protected APIs require app access issued by `POST /api/access/verify`.
- App access is stored as an HttpOnly cookie and checked server-side for app routes.
- Access grants are stateful and revoked on `POST /api/access/logout`.
- Token lifetime defaults to 7 days and can be configured with `TRADER_APP_PASSWORD_TTL_DAYS` (1-30).

## Production guardrails
- `TRADER_DEV_INSECURE=true` is rejected in production runtime (`NODE_ENV=production` or Railway runtime metadata present).
- `TRADER_AUTH_ENABLED=false` is rejected in production runtime.
- In secure mode, `TRADER_ALLOWED_ORIGINS` must be explicit and cannot include `*`.

## Persistence
- Runtime state sqlite defaults to `${TRADER_DATA_DIR}/runtime-state.db`.
- Trade intent history defaults to `${TRADER_DATA_DIR}/trade-history.jsonl`.
- Local encrypted signer records default to `${TRADER_DATA_DIR}`.
- Runtime sqlite session and pending-agent records are encrypted at rest.

## Scaling constraint
- Railway Volumes are attached to a single service replica.
- Horizontal scaling requires moving state off local volume-backed files to a managed datastore.

## Backup / restore runbook
1. Stop traffic (or scale service to zero) to quiesce writes.
2. Snapshot/copy volume files in `TRADER_DATA_DIR`.
3. Store backups in encrypted object storage with retention policy.
4. Restore by replacing files in `TRADER_DATA_DIR` and restarting service.
5. Validate with `/api/ready` and a signed-in smoke trade flow.

## Signer backend modes
- `TRADER_SIGNER_BACKEND=local`
  - Uses encrypted local signer storage.
  - Requires `TRADER_STORE_PASSPHRASE`.
- `TRADER_SIGNER_BACKEND=privy`
  - Uses signer metadata path intended for Privy-backed execution.
  - `TRADER_SIGNER_LOCAL_FALLBACK=true` enables emergency local fallback during migration/incidents.
