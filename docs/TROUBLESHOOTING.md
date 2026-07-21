# Troubleshooting

## Where things live

| What | Where |
| --- | --- |
| Launcher data | Windows: `%APPDATA%/IzLauncher` · macOS: `~/Library/Application Support/IzLauncher` · Linux: `~/.local/share/IzLauncher` (old `PersonalMCLauncher` folders migrate automatically) |
| Instances (worlds, mods, configs) | `<data>/instances/<instance-id>/` |
| Shared game files (versions/libraries/assets) | `<data>/minecraft/` |
| Auto-installed Java runtimes | `<data>/runtimes/` |
| Exported packs | `<data>/exports/` |
| Game output | the **Logs** tab of the instance (also `logs/latest.log` inside the instance folder) |

**Settings → Storage → Open data folder** gets you there from inside the app.

## Launch problems

**"Signing in…" fails / token errors** — remove the account (account chip → 🗑) and sign
in again. Microsoft refresh tokens expire after long inactivity.

**Game exits immediately with a non-zero code** — open the **Logs** tab and read the last
30 lines; it's almost always a specific mod. Common causes: a mod for the wrong loader
(Fabric jar in a Forge instance), missing dependency (the log names it), or wrong
Minecraft version.

**Out-of-memory / world stutter** — raise Max RAM (Instance settings). Accepted formats:
`8`, `8G`, `8192M` (a plain number means gigabytes). Don't allocate more than ~half your
physical RAM.

**Forge/NeoForge instance won't start but Fabric works** — modern Forge launches through
ForgeWrapper on first run, which needs a minute to run installers. Check Logs; if it
mentions ForgeWrapper failing, delete `<data>/minecraft/forge/` and launch again to
rebuild. Very new NeoForge releases can lag behind tooling support — if one specific
NeoForge version fails, try the previous stable in a fresh instance.

**Old versions (< 1.7) act weird** — ancient versions have quirks with modern launchers
everywhere; releases from 1.7.10 onward are well-supported.

## Modpack problems

**CurseForge import fails on specific mods** — some authors disable third-party
downloads. With an API key set the launcher reports exactly which mod; download it
manually from the CurseForge page into the instance's `mods/` folder and re-run the
import/update — already-present files with correct hashes are skipped.

**GitHub import says "no .mrpack asset"** — the release must have the exported `.mrpack`
attached as an asset (drag it into the release's assets box), not just the source code
zips GitHub adds automatically.

**Update check fails with rate limit** — unauthenticated GitHub API allows 60 requests/hr
per IP; opening instances a few times is fine, but a whole LAN party behind one IP can
hit it. It resets within the hour.

**A config I edited got replaced by an update** — your version is right next to it as
`<file>.bak-<version>`. Copy it back (or merge) and consider asking the pack author to
stop shipping that particular file.

## Group / announcements problems

**Group tab is empty or missing** — the launcher couldn't fetch your `izlauncher.json`.
Open the raw URL in a browser (Settings → Group shows which URL is in use); if GitHub
shows a 404, check the repo is public and the file is on `main`. JSON syntax errors also
break it — paste the file into a JSON validator.

**Edited the config but friends don't see it** — the launcher re-reads the config
(bypassing GitHub's cache) at startup, every 3 minutes while open, when the window
regains focus, and when the Refresh button is pressed. If a change still doesn't appear
after a Refresh, the commit probably didn't land on `main` — check the raw URL in a
browser.

**Announcement didn't pop up** — each announcement `id` pops once per machine. New post =
new unique `id`.

**Images in announcements don't show** — the URL must be a direct `https://…` image link
(ends in .png/.jpg/.gif). Discord attachment links and Imgur "direct links" work; page
links don't.

**"Play & Join server" missing** — the instance has no server address: set it in the
group config (`packs[].server`) or per-instance in Instance settings → Server.

## Friends panel problems

**A friend shows Offline while they're clearly playing** — presence comes from the
server's public player sample, which vanilla servers cap at 12 random names and some
servers hide entirely (`hide-online-players=true` in `server.properties`). For your own
group servers, keep that setting `false` and the panel is reliable. Also check the
username is spelled exactly (case doesn't matter).

**Everyone shows Offline** — the panel only watches servers listed in the group config
with a `server.address`; friends in singleplayer or on other servers won't appear.

## Launcher update problems

**Friends don't get launcher updates** — updates come from GitHub Releases of the
launcher repo: the repo must be public, the release must be created by the CI tag build
(it uploads `latest.yml` alongside the installers), and the installed version must have
been built from a tag. Dev runs (`npm start`) never self-update.

## Friend onboarding problems

**Windows: "Windows protected your PC"** — More info → Run anyway (unsigned installer).
**macOS: "can't be opened because it is from an unidentified developer"** — right-click
the app → Open → Open.
**Linux:** `chmod +x Personal-Minecraft-Launcher-*.AppImage` then run it.

**"Offline profiles unlock after a Microsoft account…"** — by design. A Microsoft account
that owns Minecraft must sign in on that machine first; offline profiles are for playing
without internet, not without a license.

## Developer corner

- `npm start` runs with DevTools available (Ctrl+Shift+I) — renderer errors show there;
  main-process errors show in the terminal.
- `npm test` runs the pack-engine unit tests (they use temp directories and touch no real data).
- Set `PMCL_DATA_DIR=/some/path` to run the launcher against a sandboxed data directory.
