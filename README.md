# GOD SUBCONSOLE

A runnable React/TypeScript Minecraft dashboard with Midnight Bubble glass styling, click-pop effects, optional interface sound, an authenticated WebSocket relay and PostgreSQL-compatible storage. See [the current edition guide](docs/MIDNIGHT-BUBBLE.md) for shared access, plugins and integration settings.

For a free online website, use the included [Render + Neon hosting guide](docs/FREE-HOSTING.md) and `render.yaml`. Hosting account access and private runtime configuration are required before it can be deployed. Free plans have usage limits and may sleep when idle.

## Windows setup

Use Node.js 24 LTS and PowerShell 7. Extract the ZIP into its own folder. From that folder:

```powershell
./setup.ps1
notepad .env
npm start
```

Set `PTERODACTYL_CLIENT_API_KEY` in the local `.env` editor, or use the administrator's Settings → Hosting connection form after enabling two-factor authentication. The ZIP contains placeholders only. Never put the key in frontend code or a public repository. `setup.ps1` creates random session and encryption secrets and preserves an existing `.env`.

Open [http://localhost:3100](http://localhost:3100). With the app running, open a second terminal in the project folder:

```powershell
npm run bootstrap
```

Open the one-time setup link printed by that command and choose your owner email, name, and password. The link expires after 15 minutes. There are no default admin credentials. The command works even if regular users have already signed up. Enable your authenticator from Account before making owner/admin management changes. Save the recovery codes privately.

Manual alternative: copy `.env.example` to `.env`, replace both secret placeholders with independent random values of at least 32 characters, configure the API key, then run `npm ci`, `npm run build`, and `npm start`.

## Sign up and account approval

The login page has Sign in and Sign up. As requested for this edition, **shared server control is enabled by default**: every signed-in, non-suspended member can manage the configured server. No owner promotion or approval is needed for server controls. Client-supplied roles are ignored. Site credentials and account administration remain restricted to the administrator.

Set `SHARED_SERVER_CONTROL=false` and restart to return to explicit server assignments and permissions. Suspension always blocks access. Invitations can preassign access and expire after 24 hours. Set `ALLOW_SIGNUP=false` for invitation-only registration.

The site administrator is created through protected local bootstrap or the hosted setup token. Normal sign-up never creates that administrator.

## Join address

The dashboard displays and copies `godtamilsmp.chickenkiller.com:25568` by default. Change `GAME_JOIN_ADDRESS` in `.env` or use Settings → Game join address. The network screen continues to show the actual API-returned allocations.

This is a display/join-address setting. It does not create DNS records or change your provider's IP/port allocation. Configure the hostname separately with your DNS provider; connectivity through this custom hostname was not verified.

## Hosting integration and permissions

Defaults: panel `https://dash.pulikesiyt.fun`, short server identifier `9846e0b6`. Server names, full UUIDs, current resources, allocations, and limits come from the Client API. No resource values are hardcoded. API requests originate on the backend. Never request an Application/admin key for this application.

Every server endpoint checks local server assignment and feature permissions, then checks upstream permissions. Owner access does not imply hosting provider administration. Arbitrary `console.command` permission is powerful and can grant Minecraft operators. Moderator/operator defaults include only approved command templates. Hosting subusers and application users are separate accounts.

The WebSocket relay authenticates local sessions and checks hosting WebSocket permission. Upstream tokens remain on the backend. It supports token refresh, exponential reconnects, a maximum of two connections per account and twenty total, revocation checks every 15 seconds, and slow-consumer disconnection. Output is bounded to 2,000 lines in the browser. Console commands use the authenticated HTTP endpoint. Local clearing does not delete upstream logs.

Panel redirects are refused. DNS destinations are checked at connection time against private/reserved address ranges. Signed transfer hosts must match the panel hostname or `PTERODACTYL_WS_HOSTS`. File paths are normalized; traversal and protected secret paths are rejected. Secret-looking text content is blocked. Uploads are limited to 10 MiB and do not overwrite existing files. The text editor is limited to 1 MiB and checks the current upstream content before saving; the upstream API does not supply an atomic conditional-write mechanism, so a small check-to-write race remains.

## Resource cards

- Desktop: four cards. Tablet: two per row. Mobile: one per row.
- CPU allocation percentage is `cpu_absolute / cpu_limit * 100`; 4% against 150% is 2.67% of its allowance.
- Memory/disk API byte values and MiB limits are normalized consistently; display uses MiB/GiB.
- Zero limits mean unlimited. Missing/invalid limits show unavailable, without fabricated percentages.
- Bars clamp to 0–100%; actual numbers remain visible when a limit is exceeded.
- Copy full UUID copies the validated API UUID, never the short identifier.
- A failed refresh retains last-known values with a stale indicator. A sample older than 15 seconds is stale.
- Polling is five seconds after the preceding request finishes. Up to 720 samples are retained in process memory; charts show the latest 60. History resets on restart.
- Loading skeletons, unavailable states, and reduced-motion preferences are supported.

## Implemented workspace

Server discovery/switching; resource summary/history; copyable custom join address; confirmed start/stop/restart/force-stop requests; ANSI console, search/pause/autoscroll/history/log export/fullscreen; directory browsing; text/config editor with JSON/YAML highlighting; upload, download of opened text, file/folder creation, rename/move/copy/delete; backup creation/restore/delete and protected streamed backup downloads; schedule creation/edit/delete and task creation/edit/delete; read-only allocations; startup variables; server naming; hosting-subuser management; observed plugin JAR files; approved Minecraft command templates; accounts/passwords/sessions/2FA/recovery; invitations/permissions/suspension; audit list/filter/pagination; environment-based integration configuration; branding name/color; notifications and health.

## Configuration and feature limits

- The provider returned zero backup slots. Backup creation is disabled for that plan. No backup or restore was executed against the live server.
- Email password recovery requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Without configuration, the app explains the missing service instead of claiming to send mail.
- Player roster, TPS/MSPT, and the running Java version have no verified integration. They remain unavailable. Docker-image metadata is shown only as metadata.
- Archive/extract, general binary downloads, plugin catalog downloads and custom logo uploads are not implemented. Plugin JAR uploads and encrypted integration settings are available in this edition. Uploaded JARs need a restart; the dashboard does not claim runtime activation from a filename.
- Resource history is bounded in memory, not durable monitoring storage. Application audit records currently have no automatic retention purge; use a database retention policy appropriate to your deployment.
- The app is live-only. With no key configured, integration screens show unavailable; they never simulate successful hosting actions.
- Embedded PostgreSQL (PGlite) is for single-process local use. Use an external PostgreSQL instance for production. Do not run a second process against the same embedded data directory. The bootstrap command communicates with the running app instead of opening its database.

## Verification

```powershell
npm test
npm run build
```

Tests use an isolated in-memory database and a mocked hosting adapter, including mutation tests. Read-only live calls verified the server details, limits, resources, files, empty backup/schedule/subuser lists, and console streaming. No automated test sent a live power, command, file-write, backup, schedule, or access mutation.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) and [docs/screenshots](docs/screenshots). Local browser screenshots use a disposable account with read-only server permissions. Screenshots are observations at capture time, not sample data fed into the app.

## Production deployment

Use a persistent Node.js 24 process/VM/container and PostgreSQL 17+, behind an HTTPS reverse proxy. This application needs long-lived WebSocket connections; a static host or short-lived serverless function is insufficient.

1. Configure `DATABASE_URL` with a dedicated PostgreSQL database and account. Require TLS for remote database traffic according to your provider's connection settings.
2. Set `APP_URL=https://your-console-domain`, `NODE_ENV=production`, unique session/encryption secrets, panel credentials, allowed Wings hostnames, and optional SMTP settings.
3. Run `npm ci`, `npm run migrate`, `npm run build`, then supervise `npm start`. The application listens on loopback port 3100 by default. The reverse proxy must run on the same host or use `HOST` to bind an appropriate private interface.
4. Preserve the exact public `Origin` header and forward WebSocket upgrades for `/console-stream`. Use a long proxy read timeout (e.g. 3600s). Forward normal `/api` and static requests to the same process. Terminate TLS at the proxy. Do not expose the PostgreSQL service publicly.
5. Create the owner with the local bootstrap command, enable 2FA, and explicitly assign users/permissions. Keep the app single-process unless you replace its process-local rate limits, action locks, and connection counts with shared coordination.

Back up PostgreSQL with `pg_dump` on a scheduled server-side job and test `pg_restore` in an isolated database. Store encrypted secrets separately and back up the encryption/session keys securely. For embedded development data, stop the application before copying `.data/postgres`. Database migrations are in `migrations/`; never edit an applied migration in place. Production PostgreSQL, SMTP delivery, reverse proxy deployment, and live mutations require deployment-specific verification.

## Troubleshooting

- API 401/403: verify the Client API key and upstream subuser permissions. Local grants cannot expand upstream rights.
- CSRF rejection: `APP_URL` must match the exact browser origin (including the port). Restart after editing `.env`.
- Console unavailable: verify the Wings host is included in `PTERODACTYL_WS_HOSTS`, its TLS certificate is valid, and the reverse proxy supports upgrades.
- Build temp-file access on Windows: `npm run build` uses a project-local temporary directory to avoid the host's restricted global Temp directory.
- Setup already exists: sign in as the existing owner and invite users. Regular account sign-up is not an owner-recovery mechanism.

API behavior was checked against the [Pterodactyl Client API routes](https://github.com/pterodactyl/panel/blob/1.0-develop/routes/api-client.php) and [official panel WebSocket handler](https://github.com/pterodactyl/panel/blob/1.0-develop/resources/scripts/components/server/WebsocketHandler.tsx). Database setup follows [Drizzle's PGlite guide](https://orm.drizzle.team/docs/get-started/pglite-new); server security references [Express production guidance](https://expressjs.com/en/advanced/best-practice-security.html).
