# Midnight Bubble edition

Dark blue glass cards, circular controls, floating translucent bubbles, a transparent-looking GOD SMP background, click pops and a successful-login entrance burst. Motion respects the device's reduced-motion preference. Interface audio plays after interaction and can be muted with the bottom-right sound button; the preference is saved in this browser.

## Shared server control

As requested, signed-in accounts now have control of the configured server, including files, plugins, commands, power and hosting subusers, up to the permissions allowed by the hosting API. Existing members also get these controls. Anonymous and suspended users remain blocked. Site-owner account administration and encrypted hosting credentials remain restricted.

Set `SHARED_SERVER_CONTROL=false` and restart to return to individually assigned access. In automated tests, shared control starts disabled and is enabled explicitly by the relevant tests.

## Plugins and files

Upload one file up to 10 MiB through the file manager drop zone. The checked routing option sends `.jar` files to `/plugins`; uncheck it to use the current directory. The Plugin library also accepts JAR uploads, creates `/plugins` if missing, and lists JARs and data folders from the hosting API. It refuses silent overwrites. Upload does not hot-load code or restart a running game. Restart the server when appropriate: plugin data directories are created by the plugin itself during startup. JAR names and files on disk do not prove that a plugin loaded successfully.

The library can switch an installed JAR on or off by renaming it between `.jar` and `.jar.disabled`. The backend checks the existing file and refuses name collisions. Changes apply on the next server restart; console logs remain the source for verifying whether a plugin actually loaded.

Profile photos are validated and saved in the account database (PNG, JPEG, or WebP, up to 250 KB), and can be changed or removed. Start, Restart, and Stop send requests directly to the hosting panel. Force stop and commands that grant server privileges still require explicit confirmation.

The discovery view searches the official Modrinth API. Online projects and server-installed JAR files appear in separate sections. Version information is shown when Modrinth provides it. Direct installation is not advertised: the current hosting integration only supports a signed upload of a chosen local file, so the user downloads a compatible JAR from the official project page and uploads it through the file manager or plugin library.

Migration `0002_profile_images.sql` creates a private profile-image table and a small account timestamp. It runs automatically at startup; no new environment variable is required.

## Hosting settings

Settings displays the configured server and key availability. The site administrator can submit a Client API key and server identifier or full UUID. The backend checks access with the hosting API, normalizes the returned short identifier, encrypts the key in the database, and loads it on restart. Blank key means keep the existing key. The actual credential is never returned to browsers. The panel origin and websocket allowlist remain deployment configuration.
