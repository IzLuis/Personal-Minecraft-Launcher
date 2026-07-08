# Personal Minecraft Launcher

A Minecraft launcher built for **friend groups**: one person curates modpacks, everyone
else clicks **Update** and plays. Inspired by
[bh-minecraft-launcher](https://github.com/prillcode/bh-minecraft-launcher) (MIT), rebuilt
around modpack sharing and zero-friction updates.

## What it does

| Feature | How |
| --- | --- |
| **Play any Minecraft version** | Full Mojang version list (releases + snapshots), auto-downloaded on first launch |
| **Mod loaders** | Fabric, Quilt, Forge and NeoForge installed automatically — pick from a dropdown |
| **Import modpacks** | Modrinth `.mrpack` files/URLs/search, CurseForge pack zips & project IDs, or a friend's GitHub repo |
| **One-click updates** | Launcher checks the pack's source; friends press **Update now** and only changed files are touched |
| **Shared configs** | Pack overrides carry `config/` etc.; user-edited files are backed up (`.bak-<version>`) before being replaced |
| **Optional mods** | Pack authors mark mods optional (e.g. Litematica); each player picks theirs at install/update time |
| **Personal mods** | Anyone can drop extra jars into an instance — updates never delete files the pack doesn't own |
| **Author & publish** | Add mods via built-in Modrinth search, export a versioned `.mrpack`, attach it to a GitHub release — done |
| **Auto Java** | Correct Java runtime (8/16/17/21) fetched per Minecraft version from Adoptium — friends install nothing |
| **Microsoft login** | Official MSA → Xbox → Minecraft auth chain (via [msmc](https://github.com/Hanro50/MSMC)); sign in once |
| **Launcher self-update** | New launcher releases on GitHub install themselves (electron-updater) |

**Note on accounts:** a Microsoft account that owns Minecraft: Java Edition is required.
Offline profiles exist for LAN/no-internet play, and only unlock after an owning account
has signed in on the launcher. Pirated copies aren't supported.

## Getting started (owner / developer)

```bash
# Requires Node.js 22+
npm install
npm start        # run the launcher in dev mode
npm test         # unit tests (pack engine, planning, security guards)
npm run dist     # build installers for your current OS into dist/
```

Tagging a release builds installers for Windows/macOS/Linux in CI and publishes them:

```bash
git tag v0.1.0 && git push --tags
```

Friends then download from your repo's **Releases** page.

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** — step-by-step: from this repo to your friends playing
- **[docs/AUTHORING.md](docs/AUTHORING.md)** — creating packs, sharing configs, optional mods, shipping updates
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — common problems and where the logs live

## How it's built

```
src/
├─ main/                 Electron main process (all privileged work)
│  ├─ main.js            window bootstrap, self-updater
│  ├─ ipc.js             the entire renderer↔main API surface
│  ├─ auth.js            Microsoft auth (msmc) + offline profiles
│  ├─ launch.js          minecraft-launcher-core wiring
│  ├─ mojang.js          version manifest    java.js  Adoptium runtimes
│  ├─ loaders.js         Fabric/Quilt profiles, Forge/NeoForge installers
│  ├─ instances.js       instance CRUD, mod enable/disable
│  └─ packs/
│     ├─ plan.js         pure planning logic (unit-tested)
│     ├─ install.js      diff-based install/update engine
│     ├─ sources.js      import + update orchestration
│     ├─ modrinth.js / curseforge.js / github.js
│     └─ authoring.js    Modrinth mod search/add, .mrpack export
├─ preload.cjs           contextBridge (sandboxed renderer)
└─ renderer/             plain HTML/CSS/JS — no framework, no build step
```

Key design decisions:

- **`.mrpack` is the native pack format** (open spec, works offline, supports optional
  mods). CurseForge packs are imported by resolving their manifest through the CF API,
  with a keyless fallback.
- **Updates are diffs.** The instance records which files the pack owns (`packFiles`
  in `instance.json`). Updates delete/replace only those; your saves, personal mods and
  extra files are never touched. Files you edited that an update replaces get a
  `.bak-<version>` copy.
- **GitHub Releases is the distribution channel** — free, versioned, and no server for
  you to run. The launcher polls `releases/latest` of the pack repo.

## License

MIT — see [LICENSE](LICENSE). Credit to
[bh-minecraft-launcher](https://github.com/prillcode/bh-minecraft-launcher) for the
original architecture inspiration.
