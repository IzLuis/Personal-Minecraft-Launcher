# Troubleshooting

## Where things live

| What | Where |
| --- | --- |
| Launcher data | Windows: `%APPDATA%/PersonalMCLauncher` · macOS: `~/Library/Application Support/PersonalMCLauncher` · Linux: `~/.local/share/PersonalMCLauncher` |
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

**Out-of-memory / world stutter** — raise Max RAM (Instance settings, e.g. `6G`). Don't
allocate more than ~half your physical RAM.

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
