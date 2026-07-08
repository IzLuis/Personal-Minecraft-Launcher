# Pack authoring guide

You are the group's curator. This guide covers building a pack, optional mods, config
sharing, and how updates behave on your friends' machines.

## Building a pack from scratch

1. **＋ New** → name it, pick the Minecraft version and loader (Fabric/Quilt/Forge/NeoForge)
   and the loader version (top entry is fine).
2. Open the instance → **Mods** tab:
   - **Search Modrinth** and click **Add** — this records the mod's download URL, so your
     exported pack stays small and friends download mods straight from Modrinth's CDN.
   - **Add as optional** for take-it-or-leave-it mods (minimaps, Litematica, extra
     shaders). Friends get a checkbox; you keep it enabled for yourself.
   - **＋ Add mod jar** for anything not on Modrinth. These are bundled into the export.
3. Press **Play**, configure mods in-game (mod menus, config files). All of `config/`
   ships with the pack automatically.
4. When it feels right → **Instance settings → Export as .mrpack**, version `1.0.0`.

## Building on top of an existing pack

Import any Modrinth/CurseForge pack, then customize it (add/remove mods, tweak configs)
and export the result under your own name/version. Your export includes everything
currently in the instance — the original pack's mods keep their remote URLs where known.

## What exactly gets exported?

| Included | Not included |
| --- | --- |
| Mods added from Modrinth (as URLs — small) | `saves/`, `screenshots/`, `logs/`, crash reports |
| Local mod jars (bundled) | `options.txt` (personal keybinds/video settings) |
| `config/`, `defaultconfigs/`, `scripts/`, `kubejs/` | `servers.dat` (personal server list) |
| `resourcepacks/`, `shaderpacks/`, `datapacks/`, `structures/` | `.bak-*` files, disabled duplicates |

Disabled mods (toggled off in the Mods tab) still export — friends receive them enabled
unless marked optional.

## Optional mods, precisely

- Marking a mod **optional** sets `env.client = optional` in the exported `.mrpack`.
- On import/update, friends see a checkbox list of optional mods (default **off**).
- They can change their mind anytime: optional mods appear in the Mods tab with a toggle,
  including ones they never installed ("optional · not installed").
- Their choices persist across updates; only *new* optional mods are asked about.
- Only mods with a recorded URL (added via Modrinth search, or from an imported pack) can
  be optional — a local-only jar has nowhere for friends to download it from on demand.

## How updates behave on a friend's machine

The launcher tracks which files belong to the pack (`packFiles` in `instance.json`).
On **Update now**:

- **Added/changed pack files** → downloaded (hash-verified when hashes exist).
- **Removed pack files** → deleted — *unless the friend modified that file*, in which
  case it's kept and reported ("orphaned").
- **Changed configs the friend edited** → their version is saved as
  `<file>.bak-<newversion>`, then the pack's version is applied.
- **Everything else** (their saves, personal mods, extra resource packs) → untouched.
- **Disabled pack mods stay disabled**, even when the jar itself updates.

So: friends can safely personalize, and you can safely ship updates.

## Release checklist

1. Bump the version in the export dialog (`1.1.0` — any scheme works, but be consistent).
2. Export → the `.mrpack` lands in the exports folder (it opens automatically).
3. Pack repo → **Draft a new release** → tag = the same version → attach the `.mrpack` →
   describe what changed → **Publish**.
4. Tell the group "update's out" — their launcher shows the banner on next open.

## Alternative distribution channels

- **Modrinth-hosted packs:** if you publish your pack publicly on Modrinth, friends can
  import via **Import → Modrinth** and updates flow from Modrinth versions instead.
- **CurseForge packs:** import via project ID; updates track the project's latest file.
- **Any static URL:** host the `.mrpack` anywhere (Dropbox direct link, a web server).
  Updates re-download when the pack's internal version changes. GitHub releases remain
  the recommended path — versioned, free, and fast.
