# Production Security Notes

This app is moving from proof-of-concept toward production use. Treat the items
below as the minimum security baseline before handling real member data.

## Required Environment

- Run production with `ARCHERY_APP_MODE=live`.
- Set a long random `SESSION_SECRET`. This signs session cookies and CSRF
  tokens; changing it invalidates existing sessions and CSRF tokens.
- Set `DATABASE_PATH` to a location outside the repository when using SQLite.
- For PostgreSQL deployments, set `DATABASE_ENGINE=postgres` and configure
  either `DATABASE_URL` or the explicit connection variables (`DB_HOST`,
  `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). On Cloud Run, prefer
  `INSTANCE_CONNECTION_NAME` for Cloud SQL socket connections.
- Set `TRUST_PROXY` or `ARCHERY_TRUST_PROXY` when the app runs behind a known
  reverse proxy. Leave it unset when exposing Node directly.
- Serve the app only over HTTPS in live mode. Live cookies are marked `Secure`,
  so they require HTTPS.

## HTTP Hardening

The Express app uses `helmet` to set security headers and a restrictive content
security policy. Keep any future external image, script, style, or API domains
explicit in the CSP rather than allowing broad wildcards.

Current CSP allows:

- scripts, API calls, fonts, and default resources from `self`
- images from `self` and `data:`
- inline styles, currently needed by existing UI styling
- no framing via `frame-ancestors 'none'`
- no plugin/object loading

## Session Cookies

Member sessions are signed and stored in an HttpOnly cookie named
`archeryclubpoc_session`.

Cookie settings:

- `HttpOnly`
- `Path=/`
- `SameSite=Lax`
- `Secure` in live mode
- max age aligned to the server session lifetime

Session-creation routes are:

- `POST /api/auth/login`
- `POST /api/auth/rfid`
- `POST /api/auth/rfid/latest-login`
- `POST /api/auth/guest-login`

## CSRF Protection

Mutating `/api/*` requests are protected by a signed double-submit CSRF token.
The server issues a readable `archeryclubpoc_csrf` cookie and the frontend must
send the same token in `X-CSRF-Token`.

The shared `fetchApi` helper automatically fetches `GET /api/auth/csrf` and
attaches the header for `POST`, `PUT`, `PATCH`, and `DELETE` requests.

The only CSRF-exempt mutating routes are session-creation routes, because those
must work before a user has a CSRF token. Logout is protected and clears both
the session and CSRF cookies.

## Rate Limiting And Body Limits

The server applies a coarse in-memory rate limit to `/api/*` before JSON body
parsing, then applies a stricter identity-aware rate limit to sign-in routes.
This helps reduce CPU and memory pressure from noisy clients, but it is not a
replacement for edge-level DDoS protection.

The default JSON body limit is intentionally small. Committee photo updates use
a larger route-specific parser and still validate image data URLs by MIME type
and encoded size.

Reporting and range-usage date windows are capped so a single authenticated
request cannot force very large date-by-date result generation.

The Node HTTP server also sets request, header, and keep-alive timeouts. These
can be tuned with `REQUEST_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`, and
`KEEP_ALIVE_TIMEOUT_MS`.

For production, run the app behind a reverse proxy or WAF that can enforce:

- connection limits
- per-IP request limits
- slow-client protection
- request header/body timeouts
- TLS termination

## API Exposure

Member and activity data must require an authenticated member session. The
following endpoints are intentionally not public:

- `GET /api/auth/rfid/latest-scan`
- `GET /api/guest-inviter-members`
- `GET /api/range-members`
- `GET /api/range-usage-dashboard`

`GET /api/health` must not expose filesystem paths, database paths, secrets, or
deployment internals.

## Data Handling

- Do not commit SQLite databases, exports, backups, or logs containing member
  data.
- Store live SQLite files outside the repository.
- Store PostgreSQL credentials in Secret Manager or an equivalent secret store.
- Back up the live database before running migrations or deploying schema
  changes.
- Rotate any known seed/demo passwords before real use.

## Verification Before Release

Run these checks before each production deployment:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

The CSRF test suite covers missing tokens, invalid tokens, valid tokens, and
the explicit session-creation exemption.
