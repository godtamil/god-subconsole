# GOD Subconsole implementation checklist

- [x] Existing React/Vite, Express, PGlite/PostgreSQL and Pterodactyl Client API architecture inspected and retained.
- [x] Post-sign-in GOD Servers selection page lists only the authenticated `/servers` response; valid server-specific URLs are checked against that list before opening a dashboard. Root refresh returns to selection.
- [x] Product name, page title, dark control styling, line animation, sign-in entry motion and reduced-motion behavior updated.
- [x] Resource cards use API values and allocation limits; memory and disk show available amounts. History only plots collected live samples.
- [x] Start, Stop, Restart and Force Stop use the Client API. The UI displays provider-reported status and a separate pending-request message.
- [x] Websocket console reconnects, supports command input, timestamps, search, pause, auto-scroll, and export.
- [x] File manager browses directories, searches, sorts, creates, edits, uploads with progress, downloads, renames/moves, copies and deletes. Path traversal, protected names, known symlinks and rename collisions are rejected.
- [x] Installed JARs are read from the server. Enable/disable renames them on disk for the next restart.
- [x] Official Modrinth online plugin search and release viewing added separately from installed files.
- [x] Account photo is validated, saved in the database and can be removed. Profile name, password, sessions and password reset remain; two-factor prompts, gates and stored secrets have been removed.
- [x] Provider schedules can be created, edited, paused/enabled, run now, and deleted. Tasks remain available.
- [x] Provider backups can be created, listed, downloaded, restored and deleted where the plan permits.
- [x] Searched for “Ask Integration” and “True Software Ask Integration”; neither exists in source navigation, routes, config or dependencies. Unrelated “Ask” text was preserved.

The Pterodactyl resources response does not expose player count, so the UI does not invent one. It does not provide a confirmed plugin-loaded state or schedule execution outcome; check live server logs. Plugin discovery cannot directly install a remote release through the current verified upload path. The file manager depends on the provider's root confinement for any symlink behavior the provider does not report. Backups and schedules depend on the hosting plan's upstream permissions and slots.
