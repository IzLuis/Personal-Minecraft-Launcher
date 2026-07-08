# Setup: from zero to your friends playing

Follow these tasks in order. Tasks 1–3 get *you* running; 4–6 get *your friends* running;
7 is ongoing life as the group's pack curator.

---

## Task 1 — Run the launcher on your machine

1. Install **Node.js 22 or newer** from https://nodejs.org (LTS is fine).
2. Clone your repo and install dependencies:
   ```bash
   git clone https://github.com/IzLuis/Personal-Minecraft-Launcher.git
   cd Personal-Minecraft-Launcher
   npm install
   npm start
   ```
3. The launcher window opens. Click the account chip (top-left) → **Sign in with
   Microsoft** and log in with an account that owns Minecraft.
4. Click **＋ New**, pick a Minecraft version (e.g. `1.21.1`), loader `vanilla`, and press
   **Play**. First launch downloads the game + a Java runtime — later launches are instant.

✅ You now have a working launcher. Everything below is distribution and sharing.

## Task 2 — (Optional but recommended) CurseForge API key

Only needed if your group uses CurseForge packs/mods. Modrinth needs no key.

1. Go to https://console.curseforge.com → sign up (free) → **API keys** → copy your key.
2. In the launcher: **Settings → CurseForge → API key**, paste, **Save settings**.

Without a key the launcher falls back to CurseForge's public download endpoint, which
works for most mods but gives no integrity hashes and occasionally fails for mods whose
authors disabled third-party downloads.

## Task 3 — Decide your Minecraft accounts policy

The launcher requires Microsoft sign-in. For friends on pirated copies: that's not
something this launcher supports — Java Edition regularly goes on sale, and one Game Pass
/ Microsoft account per person is the clean way to get everyone legit. Offline profiles
(playing without internet) unlock only after a real account has signed in on that
launcher install.

## Task 4 — Build installers for your friends

Your repo has CI that does this for you:

1. Push this project to GitHub (keep the repo **public** so releases are downloadable
   and the launcher self-update works without tokens).
2. Create a version tag:
   ```bash
   git tag v0.1.0
   git push --tags
   ```
3. GitHub → your repo → **Actions**: the `Build` workflow runs tests, then builds
   Windows (`.exe`), macOS (`.dmg`) and Linux (`.AppImage`) installers and attaches them
   to a **Release**.
4. Check the **Releases** page — installers should be attached to `v0.1.0`.

To build locally instead: `npm run dist:win` (or `dist:mac` / `dist:linux`) → files in `dist/`.

> **Windows SmartScreen note:** unsigned installers show "Windows protected your PC".
> Friends click **More info → Run anyway**. Code-signing certificates remove this but
> cost money; for a friend group, "Run anyway" is the normal path. On macOS,
> right-click → Open the first time.

## Task 5 — Friends install the launcher

Send them the Releases link:
`https://github.com/IzLuis/Personal-Minecraft-Launcher/releases/latest`

They: download the installer for their OS → install → sign in with their Microsoft
account. When you later tag `v0.2.0`, their launcher updates itself automatically.

## Task 6 — Create the group's pack repository

This is the channel your modpack travels through:

1. On GitHub, create a new **public** repo, e.g. `IzLuis/gang-pack`. A README is enough;
   the pack lives in release assets.
2. Build your pack in the launcher (see [AUTHORING.md](AUTHORING.md)), then
   **Instance settings → Export as .mrpack**.
3. On the pack repo: **Releases → Draft a new release** → tag `1.0.0` → attach the
   exported `.mrpack` file → **Publish**.
4. Friends: **⬇ Import pack → Friend's GitHub** → type `IzLuis/gang-pack` → **Import
   latest release** → pick their optional mods → play.

## Task 7 — Shipping updates (the loop you'll repeat)

1. Change your instance: add/remove mods (Mods tab), tweak configs by playing.
2. **Export as .mrpack** with a bumped version (`1.1.0`).
3. New GitHub release on the pack repo, tag `1.1.0`, attach the file.
4. Friends open the instance → banner: **Pack update available 1.0.0 → 1.1.0** →
   **Update now**. Their personal mods, saves, and choices survive; changed configs they
   edited are backed up as `.bak-1.1.0`.

---

### Optional extras

- **Your own Microsoft Azure app for auth:** the launcher uses msmc's shared client ID,
  which works out of the box. If you ever hit throttling, register an Azure app
  (see msmc's README) — not needed for a friend group.
- **Private pack repo:** GitHub release assets on private repos need auth tokens, which
  this launcher doesn't manage. Keep the pack repo public (a random public repo of jar
  configs is effectively invisible), or use a direct file URL you control instead.
- **Icons/branding:** drop a `build/icon.png` (512×512) and electron-builder picks it up
  at packaging time; rename the product in `package.json` → `build.productName`.
