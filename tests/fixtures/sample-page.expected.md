- [[#In this release]]
- [[#What’s new (features)]]
- [[#Bug fixes and improvements]]
    - [[#Improvements]]
    - [[#Bug fixes]]
- [[#Open tasks]]
- [[#Visual summary]]

## In this release

> [!INFO]
> This release adds **bulk import** and table sorting to the Widget Manager.
>
> Role based access control follows in the next release.

Please note: features marked `PREVIEW` are hidden in the demo system until 2026-11-01.

## What’s new (features)

**CSV import** Users can now import widgets, suppliers and contacts from a CSV file, reducing manual entry during onboarding.

**Configurable widget types**

Users can define their own widget types. The initial delivery includes:

- A master list of widget types to create, edit or delete.
- A default assignment for every category:

  - Standard widgets
  - Custom widgets

**Table sorting** Users can sort every column in list reports and value help dialogs.

## Bug fixes and improvements

#### Improvements

- **Homepage update:** The homepage has been streamlined.

  - New *“Manage users”* tile
  - New “Import data” tile
- **Value help dialog**
  The item counter now shows the number of items that are not selected.

#### Bug fixes

| **Area** | **Fix** | **Ticket** |
| --- | --- | --- |
| Value help | - Search by first name works again<br>- Counter shows the right number | [WM-101](https://site.atlassian.net/browse/WM-101) |
| Import \| export | Empty rows are skipped<br>Dates in `YYYY-MM-DD` form are accepted | [WM-102](https://site.atlassian.net/browse/WM-102) |

## Open tasks

- [x] Update the [[DOCS/User guide|user guide]]
- [ ] Record the demo video, owner @Ada Lovelace

> [!NOTE]- Upgrade steps
> 1. Back up the database.
> 1. Run the migration:
>
> ```bash
> widgetctl migrate --to 2.4.0
> widgetctl verify
> ```

## Visual summary

![[DOCS/_attachments/42/import-wizard.png]]
_The new import wizard, step 2 of 3_

See the [online documentation](https://example.com/widgets/docs) for details, or contact [Support](https://site.atlassian.net/wiki/spaces/HELP/pages?title=Support).