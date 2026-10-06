# Monthly service reports

A keyboard-first desk for the monthly field-service workbook. Work orders are entered in a form that follows the Master sheet, saved in SQLite, and exported as `.xlsm` so the existing prefix-map macro still runs in Excel.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The dev server listens on port **43123**. No account and no API key are required.

Use Node.js **24 or newer** (the storage layer uses `node:sqlite`).

Reports are stored in `data/reports.sqlite`, which is created on first launch and is not in git. Workbooks you import stay on this machine too. They are gitignored because they contain customer rows.

`templates/monthly-service-report.xlsm` is part of this repo. It is a blank Master sheet: the title block, formulas, validation lists, prefix map, and macros are there, and the work-order rows are not. A new month exports from that file. A month you imported exports from the copy stored with that month. You do not need to add a workbook by hand before the first export.

## Pages

- `/` Entry, the work-order form
- `/master` every saved work order, with search and filters
- `/statistics` jobs, hours, customers, technicians, and the date span
- `/reports` a technician report, a customer report, and totals by month
- `/technicians` add, rename, remove, and restore dropdown names without changing history
- `/customers` alphabetical names, similar-name review, and consolidation for future autofill
- `/parts` manually add, edit, and archive parts
- `/prefixes` manually edit the selected month's serial-prefix map
- `/admin` token-protected parts catalog, portable backups, storage connections, and activity logs

## Docker

```bash
docker compose up -d --build app
```

Open [http://127.0.0.1:43124](http://127.0.0.1:43124). This leaves the existing development server on 43123 available. The `reports` volume retains the database, connection settings, backups, and logs across container restarts. Imported workbooks and local data are excluded from image builds; the tracked blank template is included. The app runs as a non-root user.

For local database services:

```bash
docker compose --profile mysql --profile postgres up -d
```

In Admin, use host `mysql`, port `3306`, or host `postgres`, port `5432`. Both services start with database `service_report`, username `service_desk`, and the local test password `local-test-password`. Set your own passwords in `.env` (see `.env.example`) before using real data. The database ports bind only to this computer: MySQL on 33067 and PostgreSQL on 54327. TLS is off for these local test services; enable verified TLS for remote servers with trusted certificates.

## Administration and storage

Set `ADMIN_TOKEN` to a long random secret, or open Admin once to generate `data/admin-token.txt`. For Docker, retrieve the generated local token with:

```bash
docker compose exec app cat /app/data/admin-token.txt
```

Unlock Admin with that token. Sessions use an HttpOnly, same-site cookie and expire after eight hours. The rest of the desk retains its existing trusted local-user model; Admin authentication does not protect ordinary Entry routes. Keep the app on a trusted machine/network; add authentication for the entire app before sharing it publicly.

SQLite remains the default and keeps the existing `data/reports.sqlite` schema. Admin offers real MySQL and PostgreSQL connections with host, port, database, username, password, and verified TLS. Create the destination database first and grant its user table creation and read/write permissions. MySQL should allow packets large enough for imported workbooks (the included service sets 128 MB).

Test connection checks connectivity without changing report data. Prepare storage switch copies all reports, original workbook bytes, names, prefix maps, and parts to an **empty** destination, then verifies the complete contents before saving the new settings. The source remains intact, and a JSON backup is saved under `data/backups/`. Writes pause after successful preparation; restart the app to activate the destination:

```bash
docker compose restart app
```

Saved connection settings are in the ignored `data/storage.json`; restrict access to this directory. Environment variables (`DB_ENGINE=sqlite|mysql|postgres`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_TLS=true|false`, and optional `DATA_DIR`) override saved settings. Environment-controlled storage can be tested in Admin but must be changed on the server. To return to SQLite, download a backup, restart with `DB_ENGINE=sqlite`, and restore it. Restore creates new report copies and preserves existing catalog records; it never overwrites existing reports.

Download backup includes original imported workbooks, remembered names, and parts. Store this JSON file as carefully as the workbooks themselves. Recent activity shows the latest 200 structured events; logs rotate at 2 MB and exclude credentials and work-order text.

## Parts and entry improvements

Saving or importing work orders adds previously unknown part numbers and their descriptions to the catalog. Existing saved reports are backfilled on first catalog access. Multiline rows must align; incomplete or ambiguous rows are skipped. Manual catalog edits and archived availability are preserved.

Add or edit a part in Parts or Admin using its number and description. Archive parts to hide suggestions without changing historical work orders. Reload Entry after updating the catalog. Technicians, Parts, and Prefixes are readable and searchable without signing in. Editing requires the same admin session. Technicians supports removal/restoration of dropdown names. Prefixes edits one month's map without rewriting historical model fields.

Part No., Description, and QTY each remain **one multiline field and one Excel cell**. Type an exact number to fill empty corresponding description/quantity lines, or choose a suggestion to replace that particular line. Other lines remain intact. Enter selects a suggestion; Alt+Enter adds a line. XLSM export preserves line breaks, as Excel does with Alt+Enter.

Master columns can be sorted by clicking their headings; Clear filters restores the whole list. Entry displays informational notices for repeated WOR/serial values in the current month and other saved workbooks. Each match identifies its workbook, customer, date, and matching field, with a link to the visit. The No. column is never used for duplicate matching. Return visits are allowed.

Reports supports inclusive start/end dates, an explicit undated option, and optional monthly and service graphs. Both primary and secondary technicians receive the full recorded visit hours; a name entered in both slots counts once. Overall site hours count each visit once, so summed technician hours may exceed site hours. The header and footer show the package version. Every page shows © Zantech Limited and a red bottom-left Internal use only notice.

Failed saves retain the form and offer Retry save rather than retrying indefinitely. Month changes and normal navigation links wait for saving; browser unload warns while changes are pending.

## Verification

```bash
npm run lint
npm run check:types
npm run check:workbook
npm run check:reporting
npm run build
```

`check:workbook` checks the blank template, multiline parts, the original VBA bytes, and import/export behavior. `check:storage` requires `STORAGE_TEST=1` and an isolated `DATA_DIR` containing `.checks`; remote test databases must begin with `desk_test_`. It exercises reports, remembered names, overnight hours, workbook blobs, catalog archiving, backup/restore, and transactional rollback. Never run integration checks against your working report database.

## What you can do

- Start a blank month or import another `.xlsm` / `.xlsx` with the same Master sheet.
- Tab through a work order. Customer, Location, and technician fields filter as you type and still accept a new name.
- If a customer has one known site, Location is filled in. If they have several, the Location list is only those sites.
- A customer with past visits offers that company’s serial numbers. Choosing one fills the serial, the model from the prefix map (or the historical model when the prefix is unknown), and Location when every visit for that serial used the same site. Typed model and location stay as they are until you pick a machine on purpose.
- Export `.xlsm`. The file keeps the template’s macros, PrefixMap columns, and Master table (`Table2`). Pivot caches are not rebuilt.

The blank template does not load customer, site, or technician names. Names you type, and names in a workbook you import, are remembered after you save.

Parts usage counts each recorded part line across saved workbooks, regardless of QTY. The catalog shows total uses and per-part uses. Different descriptions for one part number can be consolidated by an administrator for future autofill; historical rows stay intact. New catalog picks use quantity 1. Typing a part fills an empty quantity with 1 and preserves existing quantities.

## Version 0.3.0 follow-up

Statistics rows, Reports summary counts, monthly bars/tables, and service-type bars link to filtered Master lists. Date-range and undated settings follow links from Reports. Blank status/service and Undated month links are supported. The first dated work order establishes a persistent workbook month. Subsequent date selections use that month only; imported historical dates remain intact. New work-order IDs also work on HTTP LAN addresses without crypto.randomUUID. Customer dropdowns are alphabetical; Customers allows read-only browsing for everyone and Admin-controlled name consolidation for future suggestions, including shared site/machine history. Portable backups preserve month locks and customer settings.

In v0.3.2, Copycount displays thousands separators in Entry and Master and exports as a numeric Excel cell with `#,##0` formatting. Import workbooks accepts multiple XLSM/XLSX files and reports each result, continuing after a failed file. Master includes a Duplicate WOR numbers only filter and row tags for repeated nonblank/non-N/A WOR values across saved workbooks; the No. column is not used for matching.
