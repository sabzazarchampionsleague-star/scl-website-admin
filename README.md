# Sabzazar Champions League

Public football league website and password-protected admin portal, using Node.js 22, Express and SQLite.

## Render deployment

The included render.yaml defines one Starter web service and a 1 GB persistent disk. Expected base price is about USD 7.25/month, excluding taxes and usage overages. Obtain owner approval before creating paid resources.

1. Push this source (including package-lock.json) to a repository in your account. Never commit .env, databases, or credentials.
2. Create a Render Blueprint from that repository.
3. Set ADMIN_PASSWORD to a unique random password of at least 20 characters (maximum 72 bytes). Keep it in a password manager. ADMIN_EMAIL defaults to admin@scl.local; this is a login identifier, not an email inbox.
4. Render generates SESSION_SECRET. NODE_ENV=production and DATA_DIR=/var/data are configured by the Blueprint.
5. Once deployment succeeds, use the assigned HTTPS URL for the public site and append /admin for the portal.
6. Verify login, create a league record, restart the service, and confirm the record remains. Verify unauthenticated writes are rejected.

No actual hosting resources have been created by this package. Hosting account access is required to deploy it.

## Storage and security

The persistent disk contains scl.db, league records, hashed admin passwords, and sessions. Keep the disk attached at /var/data. Do not move to a free ephemeral filesystem. Arrange regular SQLite-safe backups before entering irreplaceable data; persistence is not a backup.

Admin accounts are initialized only when the database has none. Changing ADMIN_PASSWORD in the environment does not reset an existing account. Use Admin > Security for password changes. Keep environment secrets out of source and logs. No default password is accepted. New databases start without fictional teams; SEED_DEMO_DATA=true explicitly enables the original demo teams.

The production service trusts one reverse proxy (Render), uses HTTPS-only cookies, a persistent session store, session regeneration on login, and 10 login attempts per 15 minutes per IP. The rate-limit counter is process-local and resets on restart. Mutating admin requests require same-site JSON. This is a single-instance deployment, not a horizontally scaled configuration.

## Local development

Install Node.js 22. Copy .env.example to .env, supply a random SESSION_SECRET of at least 32 characters and a random ADMIN_PASSWORD of at least 20 characters, then run npm ci and npm start. Local development uses http://localhost:3000 and /admin; production uses HTTPS.
