# Group config reference (`izlauncher.json`)

One JSON file controls every friend's launcher: which modpacks appear in their **Group**
tab, which server each pack joins, the Discord button, and the announcements popup.
You edit it on github.com in the browser; launchers re-read it on every start and when
someone presses Refresh.

## Where it lives

Create a public repo (e.g. `IzLuis/izlauncher-config`) containing `izlauncher.json` at
the root of the `main` branch. The launcher reads the **raw** URL:

```
https://raw.githubusercontent.com/IzLuis/izlauncher-config/main/izlauncher.json
```

That URL is baked into the launcher (`DEFAULT_GROUP_CONFIG_URL` in
`src/main/group.js`) so friends never configure anything. It can be overridden per
machine in Settings → Group.

## Full example

```json
{
  "configVersion": 1,
  "groupName": "Los Compas",
  "discordUrl": "https://discord.gg/your-invite",

  "packs": [
    {
      "id": "season3",
      "name": "Compas Season 3",
      "description": "Fabric 1.21.1 — magia, tecnología y dungeons.",
      "source": { "type": "modrinth", "project": "your-modrinth-pack-slug" },
      "server": { "address": "mc.tuservidor.mx", "port": 25565 },
      "recommended": true
    },
    {
      "id": "creativo",
      "name": "Mundo Creativo",
      "description": "Vanilla+ para construir.",
      "source": { "type": "github-releases", "repo": "IzLuis/creativo-pack" },
      "server": { "address": "creativo.tuservidor.mx" }
    }
  ],

  "announcements": [
    {
      "id": "2026-07-08-season3",
      "date": "2026-07-08",
      "title": "¡Season 3 ya está aquí! 🎉",
      "pinned": true,
      "body": "# Nuevo server\n\nEl modpack **ya está disponible** en tu launcher (pestaña *Grupo*).\n\n![mapa](https://i.imgur.com/tu-imagen.png)\n\n- 40 mods nuevos\n- Dungeons con jefes\n- [Ver el trailer](https://youtu.be/xyz)\n\n> Nos vemos el viernes a las 8pm 🕗"
    }
  ]
}
```

## Field reference

### Top level
| Field | Meaning |
| --- | --- |
| `configVersion` | Always `1` for now |
| `groupName` | Shown as the Group tab title |
| `discordUrl` | `https://` invite; renders the Discord button (omit to hide it) |

### `packs[]`
| Field | Meaning |
| --- | --- |
| `id` | Stable unique string — **never change it** after friends install (it links their instance to this entry) |
| `name` / `description` | What friends see |
| `source` | Where the pack file lives (below) |
| `version` | **Declared pack version** (e.g. `"1.1"`). When set, it drives updates: bump it and every friend gets an "Update to v1.1" button + toast. Required for `repo-file`/`url` zips |
| `server` | `{ "address": "...", "port": 25565 }` — the Play button becomes "Play & Join server". Port optional. Changing it here updates every friend's launcher automatically |
| `minecraft` + `loader` | Only needed for **plain zips** (a zip of `mods/`, `config/`… with no manifest): `"minecraft": "1.21.1", "loader": { "type": "fabric", "version": "0.16.9" }` |
| `icon` | Optional https URL for the pack icon shown on cards and instances |
| `recommended` | Shows a ★ badge |

`source` variants:
- **`{ "type": "repo-file", "path": "packs/mipack.mrpack" }` — a file committed to THIS config repo.**
  Upload the pack file to the repo (web UI: *Add file → Upload files*), reference it by
  path, set `version`, commit — friends get it. Works with `.mrpack`, CurseForge zips,
  and plain zips you built by zipping your `mods/` + `config/` folders.
- `{ "type": "modrinth", "project": "<slug or id>" }` — Modrinth-hosted pack; without a
  declared `version`, updates follow new Modrinth versions automatically
- `{ "type": "github-releases", "repo": "owner/repo" }` — pack distributed as release assets
- `{ "type": "curseforge", "project": 123456 }` — CurseForge pack by project ID
- `{ "type": "url", "url": "https://…/pack.mrpack" }` — any direct https link

> **File size:** GitHub blocks repo files over 100 MB (web uploads over 25 MB need
> *Add file → Upload files*, not drag-into-editor). Bigger packs: attach the file to a
> **Release** on this same repo and use its download URL with `"type": "url"` —
> releases allow up to 2 GB per file.

### `announcements[]`
| Field | Meaning |
| --- | --- |
| `id` | Unique string; a new id = a popup on friends' next launch. Date-prefixed ids (`2026-07-08-topic`) keep them tidy |
| `date` | Shown, and used for ordering (newest first) |
| `title` | Popup/card headline |
| `pinned` | Keeps it at the top of the News list |
| `body` | **Markdown** (see below) |
| `emoji` | Optional — big icon on the card/popup hero (default 📣) |
| `tag` | Optional — short colored label, e.g. `"server nuevo"`, `"evento"` |
| `author` | Optional — byline (defaults to the group name) |
| `image` | Optional — https URL used as the banner behind the popup/detail hero. Any size works (it's cropped to fill). If it fails to load, the gradient + emoji take over |

## Announcement Markdown

Supported: `# ## ###` headings, `**bold**`, `*italic*`, `` `code` ``, fenced code
blocks, `- lists`, `1. numbered`, `> quotes`, `---` dividers, and:

- **Links** — `[text](https://…)` (opens in the browser)
- **Images** — `![alt](https://….png)` (must be a direct https image URL; upload to
  your Discord server or Imgur and copy the direct link)
- **Video** — `![clip](https://….mp4)` renders an inline player (`.mp4`/`.webm`).
  For YouTube, use a normal link — it opens in the browser.

Raw HTML is deliberately **not** rendered (it's escaped) so a typo or a pasted snippet
can never break or hijack the launcher.

## The "new server day" routine (repo-hosted packs)

1. Build/update your pack. Get a file: export a `.mrpack` from the launcher, download
   from Modrinth/CurseForge, or just zip your `mods/` + `config/` folders.
2. On this repo: **Add file → Upload files** → drop it under `packs/` → commit.
3. Edit `izlauncher.json`: point `source.path` at the file, **bump `version`**, adjust
   the `server` address, and add an announcement with the trailer/screenshots.
4. Commit. Done — friends open IzLauncher (or it refreshes on its own within 3 min),
   get the popup, see **Install** or **Update to vX** in the Servers tab, and the Play
   button drops them straight into the server.
