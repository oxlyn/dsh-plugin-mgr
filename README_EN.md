# dsh-plugin-mgr

[![npm version](https://img.shields.io/npm/v/dsh-plugin-mgr.svg)](https://www.npmjs.com/package/dsh-plugin-mgr)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

> DeepSeek Harness (DSH) plugin: a "Plugin Manager" sub-page inside Settings → Plugins — manage installed plugins as cards with enable/disable toggles, details, and uninstall.
>
> 中文文档：[README](README.md)

![Plugin Manager panel](snapshot1.png)

![Plugin details](snapshot2.png)

## Features

| # | Form | Description |
|---|------|-------------|
| 1 | Installed plugin list | Card layout with single / two column toggle (preference remembered); shows name, version, running state, and an enable/disable switch |
| 2 | Enable / disable | Writes `disabled: true/false` through the profile user patch layer (`cordis.patch.yml`); DSH HMR applies it in ~1s, survives restarts |
| 3 | Expandable details | Click a card to expand: version / source (npm·GitHub·local classification + version range + clickable repository link) / description |
| 4 | Uninstall | Uninstall button in the expanded details (with confirmation); cleans up patch rows first, then runs `dsh plugin --profile <name> remove <pkg>` |

**Highlights:**

- Modern card UI aligned with the official DSH settings card design language (bg-layer-3 surface, 12px radius, hover highlight)
- Light/dark theme support (all colors from theme CSS variables); bilingual zh/en (follows the harness language setting, switches instantly)
- Refresh gives clear feedback: button state change + a "Refreshed · time" banner
- Safety guards: host infrastructure modules refuse toggling/uninstalling; the manager's own switch and uninstall are grayed out (hover shows "This plugin"), double-checked host-side
- Patch-layer writes are serialized (no interleaved read-modify-write), restore the empty `[]` placeholder (never brick the profile), and refuse malformed YAML
- POST endpoints require `Content-Type: application/json` (CSRF guard) with a 64KB body cap

## How it works

The plugin consists of a host side and a client side (declared via the `dsh.client` field in `package.json`):

```
┌─ host side   src/index.ts → dist/index.js ──────────────────────┐
│  ctx.webServer.register:                                          │
│    GET  /api/plugin-manager/list     reads profile deps + patch   │
│    POST /api/plugin-manager/toggle   enable/disable (patch layer) │
│    POST /api/plugin-manager/uninstall spawns dsh plugin remove    │
│  profile location: the loader's cordis:include entry path         │
└──────────────────────────────────────────────────────────────────┘
                          │ fetch (JSON)
┌─ client side src/client.js (browser module) ─────────────────────┐
│  injects the "Plugin Manager" tab via the settings.plugins.tab    │
│  React card list + switches + accordion details; zh/en dicts      │
│  registered through the locale service                            │
└──────────────────────────────────────────────────────────────────┘
```

The toggle mechanism (same lineage as dshmarket / dsh-plugin-hub's plugin console): the profile user patch layer applies per-row override semantics — `- id: X` + `disabled: true` disables, `disabled: false` force-enables — and DSH's config hot-reload (HMR) recomposes the plugin tree within ~1s.

## Install

### From npm (recommended)

```sh
dsh plugin --profile web add dsh-plugin-mgr
```

### From source / GitHub

```sh
git clone https://github.com/<your-username>/dsh-plugin-mgr.git
cd dsh-plugin-mgr && pnpm install && pnpm run build

# Run from the PARENT directory (dsh plugin add anchors relative
# paths to the invoking directory):
cd ..
dsh plugin --profile web add ./dsh-plugin-mgr
dsh web
# Startup log should show: [dsh-plugin-mgr] ready — routes GET /api/plugin-manager/list ...
```

Install straight from GitHub (prepare builds dist automatically):

```sh
dsh plugin --profile web add github:<your-username>/dsh-plugin-mgr
```

### Verify

Open `dsh web` → Settings → Plugins → the "Plugin Manager" tab; you should see cards for installed plugins.

## Requirements

- Node `^22.19.0 || >=24.0.0` (required by the DSH host)
- pnpm (for building from source)

## Development

```sh
pnpm install
pnpm run typecheck   # type checking
pnpm run build       # build dist/
```

Project layout:

```
dsh-plugin-mgr/
├── src/index.ts          # host side: list/toggle/uninstall routes + patch-layer I/O
├── src/client.js         # client side: manager tab (card UI + zh/en dictionaries)
├── cordis.patch.yml      # bundle layer declaration (id/name resolve as package names)
└── dist/                 # build output (included in the published files field)
```

## License

[MIT](LICENSE)
