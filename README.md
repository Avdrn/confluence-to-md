# Confluence Space Sync for Obsidian

Keeps folders in your vault up to date with Confluence Cloud spaces. One way only: Confluence is the source of truth. Run it whenever you want your vault to catch up.

## What it does

- A note with `confluence-space: KEY` in its front-matter marks its folder as the root of that space.
- Every page of the space becomes a note named after its title. Pages with children become folder notes (`Policies/Policies.md`). Confluence folders become folders. Databases, whiteboards and embeds become short stub notes that link to Confluence.
- Page links become wikilinks, attachments are downloaded into `_attachments/<page id>/`, panels become callouts, tables stay tables.
- A second sync is cheap: only pages whose Confluence version moved are fetched again. Unchanged notes are never rewritten.
- Renamed or moved pages are moved in the vault. Pages deleted in Confluence go to the vault trash.
- Notes you edited by hand are overwritten, and the report lists them. Your own notes inside a synced folder are left alone.

## Requirements

- Obsidian 1.11.4 or newer (the API token lives in Obsidian's secret storage).
- An Atlassian account with read access to the space and an API token from https://id.atlassian.com/manage-profile/security/api-tokens.

## Install

**From a release (BRAT):** add this repository in the BRAT plugin and enable "Confluence Space Sync".

**Manually:** copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/confluence-space-sync/`, reload Obsidian, and enable the plugin under Settings > Community plugins.

**From source:**

```
npm install
npm run build
```

For development, `OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/confluence-space-sync npm run dev` rebuilds on every change and copies the files into the vault.

## Set up

1. Open Settings > Confluence Space Sync.
2. Enter your Atlassian site, for example `https://yourcompany.atlassian.net`, and your account email.
3. Under API token, create or choose a secret and paste your Atlassian API token into it.
4. Click Test. The notice names the account Confluence sees.

## Use

1. Create a folder for the space, or open a note in it.
2. Run the command **Confluence Space Sync: Add Confluence space here** (also in the right-click menu of a folder). Pick the space. A marker note such as `ISO.md` is created, and you are asked whether to sync now.
3. Later, open any note inside the folder and run **Sync this space**, or click the refresh icon in the ribbon. **Sync all spaces** updates every marked folder in the vault.

Other commands:

| Command | What it does |
|---|---|
| Preview changes for this space | Shows what a sync would do without writing anything |
| Resync this space | Re-renders every note, for example after an attachment changed without a page edit |
| Cancel the running sync | Stops after the pages in flight; nothing is trashed |
| Show last sync report | Reopens the report of the last run |

The status bar shows progress while a sync runs. Click it to cancel. When the run is done, click it for the report.

## Front-matter

Every synced note carries these properties. Do not edit them; the sync relies on them.

| Property | Meaning |
|---|---|
| `confluence-page-id` | The Confluence content id. This is how a note is matched to its page, whatever its name. |
| `confluence-space` | Space key |
| `confluence-title` | The page title as written in Confluence |
| `confluence-version` | Confluence version the note was rendered from |
| `confluence-hash` | Hash of the note body, to detect hand edits |
| `confluence-converter` | Version of the converter that wrote the note |
| `confluence-url` | Link to the page |
| `confluence-parent-id` | Content id of the parent |
| `confluence-type` | Only for databases, whiteboards and embeds |

The marker note keeps `confluence-space`, which you set, plus `confluence-last-sync`, `confluence-space-name`, `confluence-space-id` and `confluence-site`, which the plugin fills in. Its body is yours.

## Limits

- Blog posts are not synced.
- Database rows cannot be read through the Confluence API, so a database becomes a stub note.
- An attachment that changes without a page edit is not noticed. Run "Resync this space" to refresh it.
- On Windows, very deep trees with long titles can exceed the path limit. Names are shortened to fit, and the report warns when that was not enough.
- If the vault lives in OneDrive, pause syncing during the first run of a large space.

## Development

```
npm run check     # typecheck, lint, unit tests
npm run build     # main.js
npm run test:watch
```

`scripts/capture-fixture.mjs` saves the storage body of a page into `tests/fixtures/` for local experiments. Only synthetic pages are committed as fixtures.
