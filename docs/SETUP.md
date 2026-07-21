# IzLauncher setup: from zero to your friends playing

Follow these tasks in order. Tasks 1–3 get *you* running; 4–6 wire up your group's
remote control; 7–8 get friends installed; 9 is the routine you'll repeat forever.

---

## Task 1 — Run the launcher on your machine

1. Install **Node.js 22 or newer** from https://nodejs.org (LTS is fine).
2. Clone your repo and run it:
   ```bash
   git clone https://github.com/IzLuis/Personal-Minecraft-Launcher.git
   cd Personal-Minecraft-Launcher
   npm install
   npm start
   ```
3. Account chip (top-left) → **Sign in with Microsoft**.
4. **＋ New** → pick a version → **Play** to sanity-check.

## Task 2 — (Optional) CurseForge API key, once for everyone

Only if you'll use CurseForge packs/mods (Modrinth needs nothing):

1. Get a free key at https://console.curseforge.com → **API keys**.
2. On the launcher repo: **Settings → Secrets and variables → Actions →
   New repository secret** → name `CURSEFORGE_API_KEY`, paste the key.
3. Done — every installer built from now on carries the key baked in; friends
   never configure anything. (A key pasted in the app's Settings still
   overrides it per-machine, e.g. for your own dev runs.)

Never put the key in `izlauncher.json` — that repo is public.

## Task 3 — Language

**Settings → Idioma**: Auto detects the system language (Spanish for most of your
friends). You can force Español/English anytime; it applies instantly.

## Task 4 — Create your group's control repo ⭐

This one file is your remote control for every friend's launcher:

1. On GitHub create a **public** repo named `izlauncher-config`.
2. Add a file `izlauncher.json` — copy the example from
   [GROUP-CONFIG.md](GROUP-CONFIG.md) and edit `groupName`, `discordUrl`, your packs
   and a welcome announcement.
3. Your raw URL is:
   `https://raw.githubusercontent.com/IzLuis/izlauncher-config/main/izlauncher.json`

## Task 5 — Bake your config URL into the launcher

Open `src/main/group.js` and set the constant near the top:

```js
export const DEFAULT_GROUP_CONFIG_URL =
  'https://raw.githubusercontent.com/IzLuis/izlauncher-config/main/izlauncher.json';
```

(It already points there — only edit if you named the repo differently.) This is what
makes friends' launchers "just know" about your group with zero setup on their side.

Run `npm start` and check the **Group** and **News** tabs load your config.

## Task 6 — Build installers

```bash
git add -A && git commit -m "My group config"
git tag v0.2.0
git push && git push --tags
```

GitHub **Actions** runs tests, builds Windows/macOS/Linux installers and attaches them
to a **Release** automatically. Keep the launcher repo **public** — that's what lets
installed launchers self-update without any tokens.

> Local alternative: `npm run dist:win` → `dist/IzLauncher-…-Setup.exe`.

## Task 7 — Friends install (the only thing they ever do)

Send them one link:
`https://github.com/IzLuis/Personal-Minecraft-Launcher/releases/latest`

They download the installer, click through SmartScreen ("More info → Run anyway" — the
build is unsigned, which is normal for hobby apps), sign in with their Microsoft
account, and they're done **forever**:

- Your packs appear in their **Group** tab → one click to install.
- Pack updates → banner → one click.
- **Launcher** updates → downloaded automatically, "Restart to update" button appears.
- Announcements pop up when you publish them. Discord button takes them to your server.

## Task 8 — Publish your first pack

1. Build the pack on **Modrinth** (your preferred flow) *or* author it in the launcher
   and export a `.mrpack` to a GitHub release (see [AUTHORING.md](AUTHORING.md)).
2. Add it to `izlauncher.json` under `packs` with the server address.
3. Commit. Open the launcher → Group tab → your pack is there.

## Task 9 — The "new server day" routine ⭐

1. Update the pack on Modrinth (new version) — or publish a new `.mrpack` release.
2. Edit `izlauncher.json`: bump/add the pack entry, set the `server` address, and write
   an announcement (Markdown: images, video, links — see GROUP-CONFIG.md).
3. Commit, then post in Discord: *"El modpack ya está disponible en tu launcher."*
4. Friends open IzLauncher → popup with your announcement → **Install/Update** → the
   Play button reads **"Play & Join server"** and drops them straight in.

To update the launcher itself: bump `"version"` in `package.json`, commit, tag
(`git tag v0.2.1 && git push --tags`) — friends get the restart-to-update banner.

---

### Notes

- **Accounts policy:** Microsoft sign-in is required (pirated copies aren't supported).
  Offline profiles unlock only after an owning account signs in — for LAN/no-internet.
- **Changing a pack's server address later:** just edit the config — every friend's
  launcher syncs it automatically. Never change a pack's `id`.
- **Private config?** The config repo must be public (raw URLs need no auth). It
  contains nothing sensitive — pack names and a server address.
