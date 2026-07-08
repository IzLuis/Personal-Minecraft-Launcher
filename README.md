<p align="center"><img src="src/renderer/icon.png" width="96" alt="IzLauncher" /></p>

# IzLauncher

A Minecraft launcher built for **friend groups**, in **English & Español**: one person
curates modpacks and servers, everyone else clicks **Install** / **Update** / **Play &
Join server**. Inspired by
[bh-minecraft-launcher](https://github.com/prillcode/bh-minecraft-launcher) (MIT),
rebuilt around group management and zero-friction updates.

## What it does

| Feature | How |
| --- | --- |
| **Group tab** | Friends' launchers read your `izlauncher.json` (a GitHub-hosted file): your packs appear automatically with one-click install |
| **Play & Join server** | Per-pack server address in the config → the Play button drops friends straight into your server (Quick Play on 1.20+, `--server` on older) |
| **Announcements** | Markdown posts (text, images, video, links) — popup on launch + a News tab. You publish by editing one file |
| **Discord button** | Configured invite link, one click |
| **Any Minecraft version** | Full Mojang list (+ snapshots), downloaded on demand |
| **Mod loaders** | Fabric, Quilt, Forge, NeoForge — installed automatically |
| **Modpack import** | Modrinth (`.mrpack`/search/URL), CurseForge (zip/ID), GitHub releases, local files |
| **One-click pack updates** | Diff-based: only pack-owned files change; personal mods, saves and settings survive; edited configs get `.bak` backups |
| **Optional mods** | Authors mark mods optional (Litematica-style); each friend picks theirs, choices persist across updates |
| **Authoring tools** | In-app Modrinth mod search, mark-as-optional, export versioned `.mrpack` |
| **Auto Java** | Correct Temurin runtime (8/16/17/21/…) fetched per version — friends install nothing |
| **Microsoft login** | Official auth chain via msmc; sign in once. Offline profiles only after an owning account signs in |
| **Launcher self-update** | New releases download in the background; friends see "Restart to update" |
| **English/Español** | Auto-detected, toggleable in Settings |

## Getting started (owner / developer)

```bash
npm install
npm start        # run in dev mode
npm test         # unit tests (pack engine, group config, markdown safety)
npm run dist     # build installers for your current OS
```

Release: `git tag v0.2.0 && git push --tags` → CI builds Win/mac/Linux installers and
publishes them; installed launchers self-update.

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** — owner's step-by-step: repo → config → installers → friends playing
- **[docs/GROUP-CONFIG.md](docs/GROUP-CONFIG.md)** — the `izlauncher.json` remote-control file (packs, servers, Discord, announcements)
- **[docs/AUTHORING.md](docs/AUTHORING.md)** — creating packs, optional mods, shipping updates
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — common problems, log locations

## How it's built

Electron + plain JavaScript (no framework, no build step) for easy maintenance.

```
src/
├─ main/                  Electron main process
│  ├─ main.js             window, auto-updater wiring
│  ├─ ipc.js              renderer↔main API surface
│  ├─ group.js            group config fetch/validate/sync (the remote control)
│  ├─ auth.js             Microsoft auth (msmc) + offline profiles
│  ├─ launch.js           minecraft-launcher-core wiring, RAM normalization, Quick Play
│  ├─ mojang.js / java.js / loaders.js
│  ├─ instances.js        instance CRUD, mods, per-instance server
│  └─ packs/              plan.js (pure logic) · install.js (diff engine) ·
│                         sources.js · modrinth.js · curseforge.js · github.js · authoring.js
├─ preload.cjs            sandboxed contextBridge
└─ renderer/              vanilla HTML/CSS/JS
   ├─ app.js              UI (Group / Library / News / Settings)
   ├─ i18n.js             EN/ES dictionaries
   ├─ md.js               XSS-safe Markdown renderer for announcements
   └─ icon.png            original pixel-art enchanted golden apple
```

Design principles: `.mrpack` as the native pack format; updates are diffs against a
recorded `packFiles` manifest (user data is never touched); GitHub is the free
distribution channel for the launcher, the packs, and the group config.

## License

MIT — see [LICENSE](LICENSE). Architecture credit:
[bh-minecraft-launcher](https://github.com/prillcode/bh-minecraft-launcher).
