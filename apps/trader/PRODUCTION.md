# Trader Production Deployment (Railway)

Last verified against repo code on 2026-03-10.

This runbook is for the `apps/trader` service (single deployment serving both API and web SPA).

Privy is now part of the required auth path. The SPA must be built with `VITE_TRADER_PRIVY_APP_ID`, and the API verifies Privy bearer tokens with `TRADER_PRIVY_APP_ID` plus `TRADER_PRIVY_JWT_VERIFICATION_KEY`.

## 1. Railway service settings

- Source repo: this monorepo
- Root directory: `/`
- Dockerfile path: `apps/trader/Dockerfile`
- Start command: none (uses Docker `CMD`)
- Public networking: enable a Railway domain (and optional custom domain)
- Persistent volume: mount at `/data`

The Docker image already sets:

- `NODE_ENV=production`
- `TRADER_DATA_DIR=/data`

## 2. Required environment variables

Set these in Railway `Variables`:

- `VITE_TRADER_PRIVY_APP_ID`
  - Required at Docker build time and runtime.
  - Must match your Privy app.
- `TRADER_PRIVY_APP_ID`
  - Required when `TRADER_AUTH_ENABLED=true` (default).
- `TRADER_PRIVY_JWT_VERIFICATION_KEY`
  - Required when `TRADER_AUTH_ENABLED=true` (default).
  - Used by the server to verify Privy access tokens.
- `TRADER_APP_PASSWORD`
  - Required, non-empty, minimum 16 characters.
  - Used by `/unlock` and protected API routes.
- `TRADER_STORE_PASSPHRASE`
  - Required for local signer mode (default mode).
  - Minimum 8 characters.
- `TRADER_ALLOWED_ORIGINS`
  - Required in production.
  - Comma-separated full origins, for example:
  - `https://<service>.up.railway.app,https://app.yourdomain.com`
  - The app uses secure HttpOnly cookies for the `/unlock` gate, so browser clients should be served from the same site as the API.

You usually do not need to set `TRADER_PORT`; Railway provides `PORT` and the app reads it automatically.

## 3. Recommended environment variables

- `TRADER_DEFAULT_NETWORK=mainnet`
- `TRADER_RUNTIME_STATE_BACKEND=sqlite`
- `TRADER_RUNTIME_STATE_SQLITE_PATH=/data/runtime-state.db`
- `TRADER_HOST=0.0.0.0` (safe explicit value; default is already `0.0.0.0` in production)
- `TRADER_APP_PASSWORD_TTL_DAYS=7` (valid range is `1` to `30`)
- `TRADER_AUTH_ENABLED=true`
- `TRADER_DEV_INSECURE=false`
- `TRADER_ENABLE_DEBUG_ROUTES=false`

## 4. Optional signer/backend variables

Use these when you want Privy-managed server-side agent signing:

- `TRADER_SIGNER_BACKEND=privy`
- `TRADER_SIGNER_LOCAL_FALLBACK=true|false`
- `TRADER_PRIVY_APP_SECRET`
- `TRADER_PRIVY_AUTHORIZATION_KEY`

If `TRADER_SIGNER_BACKEND=local` (default), keep `TRADER_STORE_PASSPHRASE` set.

## 5. Production guardrails (startup will fail if violated)

In Railway/production runtime:

- `TRADER_DEV_INSECURE=true` is rejected.
- `TRADER_AUTH_ENABLED=false` is rejected.
- `TRADER_ENABLE_DEBUG_ROUTES=true` is rejected.
- `TRADER_HOST` cannot be loopback (`127.0.0.1`, `localhost`, `::1`).
- `TRADER_ALLOWED_ORIGINS` cannot be empty, `*`, booleans, or non-URL values.

## 6. Deploy checklist

1. Push latest `main` to GitHub.
2. Confirm Railway service uses `apps/trader/Dockerfile`.
3. Confirm volume is mounted to `/data`.
4. Confirm required env vars above are set.
5. Trigger deploy.
6. Watch startup logs for:
   - `Trader API listening on http://0.0.0.0:<port>`
   - `Privy bearer-token auth enabled`

## 7. Post-deploy smoke tests

Replace `<host>` with your public domain.

```bash
curl -sS https://<host>/api/health
curl -sS -i https://<host>/api/ready
```

Expected:

- `/api/health` returns `200` with `"status":"ok"`.
- `/api/ready` returns `200` and `"ready":true`.

Then open:

- `https://<host>/unlock` and verify unlock with `TRADER_APP_PASSWORD`.
- Complete a Privy login and confirm authenticated API calls succeed.

## 8. Data persisted in `/data`

With the volume mounted, these persist across restarts:

- Encrypted signer files (`*.enc`) in `TRADER_DATA_DIR`
- `runtime-state.db` (sqlite runtime/session/access state)
- `trade-history.jsonl`
- `signers.json` (Privy signer metadata)

If the volume is removed, signer/runtime history data is lost.

## 9. Common startup errors and fixes

- `TRADER_APP_PASSWORD must be at least 16 characters`
  - Set a stronger password.
- `TRADER_STORE_PASSPHRASE must be set...`
  - Set `TRADER_STORE_PASSPHRASE` (min 8 chars).
- `Privy auth requires TRADER_PRIVY_APP_ID and TRADER_PRIVY_JWT_VERIFICATION_KEY`
  - Set both auth env vars and rebuild if `VITE_TRADER_PRIVY_APP_ID` was missing.
- `TRADER_ALLOWED_ORIGINS must be set...`
  - Add valid `https://...` origins.
- `TRADER_HOST=127.0.0.1 is not allowed in production runtime`
  - Set `TRADER_HOST=0.0.0.0` or unset it.
- `/api/ready` returns `503` with `dataDirWritable=false`
  - Check volume mount path is `/data` and writable.
