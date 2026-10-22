# Confluence Space Sync for Obsidian

Keeps folders in your vault up to date with Confluence Cloud spaces, and sends the changes you make in Obsidian back to Confluence when you ask it to, after a review.

## What it does

- A note with `confluence-space: KEY` in its front-matter marks its folder as the root of that space.
- Every page of the space becomes a note named after its title. Pages with children become folder notes (`Policies/Policies.md`). Confluence folders become folders. Databases become notes holding one table with every row. Whiteboards and embeds become short stub notes that link to Confluence.
- Page links become wikilinks, attachments are downloaded into `_attachments/<page id>/`, panels become callouts, tables stay tables.
- A second sync is cheap: only pages whose Confluence version moved are fetched again. Unchanged notes are never rewritten.
- Renamed or moved pages are moved in the vault. Pages deleted in Confluence are trashed the way your "Deleted files" setting says.
- Every synced note has a cloud icon in its header. Its menu gets the Confluence version of that one page, compares the note with Confluence, opens the page in the browser, and, once turned on in the settings, sends your changes to Confluence.
- Sending opens a review pane beside the note: one card per change, shown as it will read with removed words struck through and new words highlighted, a switch on every card, and a heads-up wherever Confluence holds something the note cannot say (a status label, a person mention, a diagram). Only the blocks you changed are sent; everything else on the page stays exactly as it was, macros included.
- A note you changed in Obsidian is never overwritten silently. The sync asks whether to keep your changes or replace them with the Confluence version (a setting can fix the answer). Kept notes get `confluence-unpushed` in their properties until the changes are sent to Confluence or you take its version. Your own notes inside a synced folder are left alone.

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

### Sending changes back

1. Turn on **Allow sending changes to Confluence** in the settings. Until then the plugin never writes to Confluence.
2. Edit a synced note. The cloud icon in its header changes to an upload cloud.
3. Click the icon and choose **Send my changes to Confluence**. The review pane opens beside the note and follows it while you keep typing.
4. Read the cards. Switch off any change you want to keep in the note only. Tick the heads-ups you accept. Optionally write a note for the page history.
5. Click **Send**. The page gets a new version, and the note is refreshed from Confluence so both read the same.

The review stops before anything is sent when Confluence changed since the note was last synced, or when someone holds unpublished changes on the page. In the first case, get the Confluence version first and make your changes again.

Live docs work too. A live doc shows what is being edited right now rather than its latest version, so a send saves the new version and then writes the same text into the live doc. When someone edited the live doc in the last minutes and Confluence has not saved that as a version yet, the review warns you that sending replaces their edits.

What cannot be sent from a note: status labels, person mentions, Jira issue lists, diagrams, dates, the automatic table of contents and child-page lists, text pulled in from another page, column widths and merged cells, image sizes, and task assignees. All of these survive untouched as long as you do not edit the block they sit in; when you do, the review says what will be lost.

Other commands:

| Command | What it does |
|---|---|
| Get the Confluence version of this note | Refreshes the active note only; asks first when the note holds changes of its own |
| Send my changes in this note to Confluence | Opens the review pane for the active note |
| Compare this note with Confluence | Opens the review pane read only |
| Open this note in Confluence | Opens the page in the browser |
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
| `confluence-unpushed` | Present while the note holds changes made in Obsidian that are not in Confluence; the value is the time of the sync that kept them |

The marker note keeps `confluence-space`, which you set, plus `confluence-last-sync`, `confluence-space-name`, `confluence-space-id` and `confluence-site`, which the plugin fills in. Its body is yours.

## Limits

- Blog posts are not synced.
- A database note is read only: Confluence has no API that writes rows. Its rows come from an endpoint Atlassian marks experimental. On a site where it is not available yet the database becomes a stub note, the report says so, and "Resync this space" tries again. Lookup columns (entry details, backlinks, page details, labels, page status, Jira details) are not returned by the API and are named under the table. Rich text in a cell keeps its paragraphs and list items, but not its formatting.
- An attachment that changes without a page edit is not noticed. Run "Resync this space" to refresh it.
- Sending works for pages that already exist in Confluence. New notes, renamed notes and new images are not sent yet.
- When Confluence changed since the last sync, the review does not merge the two sides yet: get the Confluence version first.
- On Windows, very deep trees with long titles can exceed the path limit. Names are shortened to fit, and the report warns when that was not enough.
- If the vault lives in OneDrive, pause syncing during the first run of a large space.

## Development

```
npm run check     # typecheck, lint, unit tests
npm run build     # main.js
npm run test:watch
```

`scripts/capture-fixture.mjs` saves the storage body of a page into `tests/fixtures/` for local experiments. Only synthetic pages are committed as fixtures.
