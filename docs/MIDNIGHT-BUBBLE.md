# Midnight Bubble edition

Dark blue glass cards, circular controls, floating translucent bubbles, a transparent-looking GOD SMP background, click pops and a successful-login entrance burst. Motion respects the device's reduced-motion preference. Interface audio plays after interaction and can be muted with the bottom-right sound button; the preference is saved in this browser.

## Shared server control

As requested, signed-in accounts now have control of the configured server, including files, plugins, commands, power and hosting subusers, up to the permissions allowed by the hosting API. Existing members also get these controls. Anonymous and suspended users remain blocked. Site-owner account administration and encrypted hosting credentials remain restricted. Two-factor requirements for administrative changes are preserved.

Set `SHARED_SERVER_CONTROL=false` and restart to return to individually assigned access. In automated tests, shared control starts disabled and is enabled explicitly by the relevant tests.

## Plugins and files

Upload one file up to 10 MiB through the file manager drop zone. The checked routing option sends `.jar` files to `/plugins`; uncheck it to use the current directory. The Plugin library also accepts JAR uploads, creates `/plugins` if missing, and lists JARs and data folders from the hosting API. It refuses silent overwrites. Upload does not hot-load code or restart a running game. Restart the server when appropriate: plugin data directories are created by the plugin itself during startup. JAR names and files on disk do not prove that a plugin loaded successfully.

## Hosting settings

Settings displays the configured server and key availability. The site administrator can submit a Client API key and server identifier or full UUID. The backend checks access with the hosting API, normalizes the returned short identifier, encrypts the key in the database, and loads it on restart. Blank key means keep the existing key. The actual credential is never returned to browsers. The panel origin and websocket allowlist remain deployment configuration.
