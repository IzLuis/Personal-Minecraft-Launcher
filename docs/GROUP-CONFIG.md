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
| `source` | Where the pack lives (below) |
| `server` | `{ "address": "...", "port": 25565 }` — the Play button becomes "Play & Join server". Port optional. Changing it here updates every friend's launcher automatically |
| `recommended` | Shows a ★ badge |

`source` variants:
- `{ "type": "modrinth", "project": "<slug or id>" }` — your Modrinth-hosted pack; updates follow new Modrinth versions. **This is the flow you wanted: manage the pack on Modrinth, friends get it here.**
- `{ "type": "github-releases", "repo": "owner/repo" }` — pack distributed as `.mrpack` release assets (see AUTHORING.md)
- `{ "type": "curseforge", "project": 123456 }` — CurseForge pack by project ID
- `{ "type": "url", "url": "https://…/pack.mrpack" }` — any static link

### `announcements[]`
| Field | Meaning |
| --- | --- |
| `id` | Unique string; a new id = a popup on friends' next launch. Date-prefixed ids (`2026-07-08-topic`) keep them tidy |
| `date` | Shown, and used for ordering (newest first) |
| `title` | Popup/card headline |
| `pinned` | Keeps it at the top of the News list |
| `body` | **Markdown** (see below) |

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

## The "new server day" routine

1. Publish the new pack version on Modrinth (or a new `.mrpack` release).
2. Edit `izlauncher.json` on GitHub: add/adjust the pack entry (id, server address), and
   add an announcement with the trailer/screenshots.
3. Commit. Done — friends open IzLauncher, get the popup, see the pack in **Group**, and
   click **Install** (or **Update**). The Play button takes them straight into the server.
