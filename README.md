# Sabzazar Super League

Current Cloudflare Workers website and admin portal source.

- Website: https://sabzazarchampionsleague.club/
- Admin: https://admin.sabzazarchampionsleague.club/

## Build
Use Node.js 22. Run `npm ci --legacy-peer-deps`, then `npm run build`.

## Deployment
Authenticate with Cloudflare using `npx wrangler login`. Review the existing D1 binding and custom domains in `wrangler.jsonc` before deploying. Do not recreate or reset the live database. Set required secrets securely in Cloudflare; credentials are not included here.

Numbered migrations under `drizzle/` are authoritative. Do not blindly rerun setup or generate migrations from the reference schema.

## Current features
Official clubs and squads, scheduled fixtures, live scores and timers, results and standings, news, winner announcements, accounts, events, restricted staff access and broadcasts. The former club registration flow is disabled.

## Data and secrets
Production teams, logos uploaded through admin, players, matches and accounts reside in D1 and are not copied into this repository. No passwords, OAuth tokens, private backups or administrator guides are included.
