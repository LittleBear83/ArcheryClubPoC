# Remember This Device release notes

## Behaviour and security

- The checkbox appears only on the mobile member login form and starts unchecked. A successful mobile username/password login with opt-in creates one random 256-bit token for that browser storage profile.
- The browser receives the token in an HttpOnly, SameSite=Lax cookie scoped to `/api/auth`; live HTTPS responses also set `Secure`. The database stores its SHA-256 hash, a keyed credential fingerprint, the member ID and absolute issue/expiry timestamps. No password or authentication token is stored in localStorage.
- The token expires exactly seven days after the password login. Automatic sign-in neither rotates the token nor resets its cookie age. The normal session it creates is capped at the token's remaining lifetime.
- Explicit logout deletes this device's database token and clears both cookies. Inactivity clears only the normal session. Password changes and password resets, account deactivation, and user deletion invalidate affected tokens in the database; validation also rejects inactive members and changed credentials.
- Each Safari or installed-app storage profile may have its own token. Cookie retention depends on browser settings and user storage clearing. A missing cookie requires password sign-in.

## Database change

PostgreSQL migration `024_remembered_devices` adds a private `remembered_devices` table, two indexes, and a `users` trigger that deletes tokens after password changes or deactivation. The startup migration runner applies it transactionally under its existing advisory lock. The migration does not change existing API payloads or sync tables, and the existing Pi application does not need an update. SQLite creates the equivalent local-only table and trigger during application bootstrap.

The previous Cloud Run revision ignores the new table and remains application-compatible after migration. Rolling traffic back does not reverse the migration. Token issuance will be unavailable while the database is unavailable; existing password login and session behaviour remain separate.

The trigger installation takes a schema lock on `users` while the migration transaction runs. Its duration needs staging measurement with production-like load before deployment. Create and verify a current recovery point before deploying; do not manually alter production tables.

## Validation before deployment

1. Run the normal tests, typecheck, lint and build.
2. Run `npm run test:postgres-integration` only with `ARCHERY_POSTGRES_INTEGRATION_TESTS=1` against an isolated loopback PostgreSQL server. The integration test creates and drops a disposable database with the project's safety guard.
3. In staging, check mobile opt-in, passwordless return, absolute expiry, explicit logout, inactivity logout, two devices, password reset, deactivation/reactivation, and normal desktop/RFID/kiosk flows.
4. Confirm the browser sends the cookie on the intended iPhone Safari and Home Screen installations. No reminder or expiry notification is displayed.
