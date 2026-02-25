# Trader Production Notes (Railway)

## Runtime model
- Deploy as a single Railway service (API + static web from one domain).
- Mount a Railway Volume and set `TRADER_DATA_DIR` to that mount path.
- Put the production domain behind Cloudflare Access during restricted beta rollout.

## App password gate
- Set `TRADER_APP_PASSWORD` to a strong secret before startup (server fails to boot when missing).
- Landing routes (`/`, `/v2`) remain public.
- All other routes and APIs require a valid `x-trader-access-token` issued by `POST /api/access/verify`.
- Token lifetime defaults to 30 days and can be configured with `TRADER_APP_PASSWORD_TTL_DAYS`.

## Persistence
- Runtime state sqlite defaults to `${TRADER_DATA_DIR}/runtime-state.db`.
- Trade intent history defaults to `${TRADER_DATA_DIR}/trade-history.jsonl`.
- Local encrypted signer records default to `${TRADER_DATA_DIR}`.

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
