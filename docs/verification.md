# Version 0.2.0 verification — 5 October 2026

The local preview is running at http://127.0.0.1:43124 under Compose project `report-entry-review-20261005`. The older server on port 43123 and the original workbook files were left intact.

## Completed requests

- Technicians, Parts, and Prefixes have searchable read-only views for all users. Admin sessions enable manual editing. Technician removal hides suggestions without changing historical assignments and supports restoration.
- Parts autofill aligns newline-separated part numbers, descriptions, and quantities. Export retains one cell per column and preserves line breaks.
- Reports has inclusive date ranges, explicit undated inclusion, and optional monthly jobs/hours and service graphs.
- Reports and Statistics credit full visit hours to both primary and secondary technicians. The same technician in both slots counts once; site totals count the visit once.
- Duplicate notices compare WOR and serial only, ignore case/whitespace and N/A, identify the source workbook and visit, and link to it. Separate WOR/serial counts include matches beyond the 50-row display limit.
- Every page displays version 0.2.0, © Zantech Limited, and the red bottom-left Internal use only notice.
- Admin includes structured logs, portable backup/restore, SQLite/MySQL/PostgreSQL connection testing and verified migration into an empty destination.
- UI cleanup includes readable typography, keyboard focus, responsive navigation, grouped fields, save status, Master sorting/filter reset, and retained edits with explicit retry after save failure.

## Passed checks

- ESLint, TypeScript, and Docker production build.
- Workbook regression including multiline cells and unchanged VBA bytes.
- Five real XLSM roundtrips: April 133, May 193, June 160, July 197, August 173 orders (856 total). Field values, prefix maps, multiline cells, and VBA bytes survived; Excel numeric strings were compared by numeric value where serialization differs. Originals were not modified.
- SQLite, MySQL, and PostgreSQL integration: report persistence, primary/secondary suggestions, removed technicians, archived parts, original workbook blobs, backup/restore, rollback, and deletion.
- SQLite-to-MySQL and SQLite-to-PostgreSQL migrations: complete content verification including technicians, source retention, local backup, saved configuration, and paused writes pending restart.
- Docker HTTP: public catalog reads, protected mutations, signed sessions, connection testing, five authorized workbook imports, catalog/prefix editing, historical assignments, No. exclusion, N/A exclusion, full repeat counts beyond 50, multiline export, backups, and logs.
- Browser: Admin unlock; technician add/remove/restore visibility; manual part and prefix submission; signed-out catalog browsing without edit buttons; native date picker changes; secondary visit credit; WOR counts and N/A suppression; retained edits while the preview was stopped and successful Retry save after restart; 390px Entry/Reports layouts without page overflow.

## Practical limits and future ideas

Excel macros were preserved byte-for-byte, but macro execution and pivot refresh were not tested in Excel. Remote TLS certificate deployments were not tested; local database checks used the bundled non-TLS services.

Future improvements include whole-app authentication before network/public deployment, optional whole-workbook import deduplication, customer-name cleanup with a preview of historical impact, and pagination for very large report collections. These are documented follow-ups rather than hidden changes to existing report data.

The preview contains imported copies and synthetic test fixtures. Local data, credentials, filled workbooks, and test exports are excluded from Git and Docker images.

## Parts follow-up checks

Parts now learns unknown catalog entries from saved/imported work orders and backfills historical reports. The catalog shows total part-line occurrences and usage beside each description, excluding blank/N/A part numbers. Usage is recalculated from current saved reports, so repeated saves do not inflate counts. New entries fill quantity 1, and existing entered quantities survive exact-match autofill; the default quantity setting was removed from Parts and Admin.

Different descriptions for one normalized part number are flagged. Admin users can consolidate by choosing a description or editing the catalog entry. The preferred description affects future autofill and does not rewrite historical descriptions or quantities. Previously resolved historical variants do not repeatedly raise a warning; a newly recorded variation does. Regression tests passed on SQLite, MySQL, and PostgreSQL, and the browser controls were tested with a disposable fixture removed after verification.

## v0.3.0 report drill-down and customer checks

Statistics status, service type, and technician links and Reports month/service graphs and summaries open filtered Master lists. Report links retain the selected inclusive date range and undated setting; individual job links open their workbook row. Browser checks confirmed the Completed count and October graph count matched their filtered lists.

New empty workbook creation and adding another work order passed browser checks. The first dated row establishes a persistent workbook month. Date inputs expose that month's minimum/maximum dates and reject dates outside it; the backend enforces the same constraint. Unchanged imported historical dates are preserved, including legacy mixed-month workbooks. Backup restore preserves the month locks and customer settings.

Customers is publicly readable and alphabetical, with manual Admin editing/removal/restoration and reviewable similar-spelling suggestions. Consolidation changes future dropdown/autofill suggestions and preserves historical customer names. The isolated regression script passed on SQLite, MySQL, and PostgreSQL. ESLint, TypeScript, the existing storage/reporting/round-trip checks, and the production Docker build passed. A disposable browser workbook was removed after checking creation, insertion, and month boundaries.

## v0.3.1 Month dropdown regression

The Month select previously navigated on change while its controlled value remained the current report, briefly resetting the selection and remounting the editor. It now keeps a pending selection and switches only through Open month, after saving current edits. The active workbook option uses the current month/preparer/order count. Native select Alt+Up/Down keys are no longer intercepted by the work-order navigation shortcuts; before the fix, Alt+Down on Month advanced the selected work order.
Browser regression checks passed: selecting multiple months retained the current URL and selected choice; Open month loaded July and then October; Alt+Down on Month kept the work-order index at 0. The final Docker production build, ESLint and TypeScript passed.

## Parts most-used sorting

Parts includes Part number and Most used sort options for all users. Most used orders by recorded part-line usage descending, with part number breaking ties. Browser checks confirmed descending counts (21, 21, 11, 8, 7), search combined with sorting, and switching back to part-number order. ESLint, TypeScript, and the Docker production build passed.

## Clickable part usage

Each Used X times count links to Master with an exact part-number filter. Matching ignores case and surrounding spaces and checks every newline-separated part number. Regression checks reject prefix-only matches. Browser verification for FC0-5080-000 opened 21 matching work orders; Clear filters restored all 1328 preview orders. A work order appears once even if its parts cell repeats the part number. Reporting regressions, TypeScript, ESLint, and Docker production build passed.

## v0.3.2 Copycount, bulk import and duplicate WOR filter

Copycount uses thousands separators in Entry (on leaving the field) and the Master list. Excel export retains a numeric value and clones the existing Copycount style with built-in #,##0 number format, preserving other style properties. Round-trip checks verify the numeric value, number format and byte-identical macros.

Import workbooks accepts multiple XLSM/XLSX files, uploads each sequentially, shows filename/progress and per-file results, and continues on failure. Browser testing selected two disposable valid workbooks with an invalid workbook between them; both valid files imported successfully and the failure appeared in the result list.

Master tags repeated nonblank/non-N/A WOR values across saved workbooks and offers Duplicate WOR numbers only. No. is ignored. Duplicate counts remain global when other filters narrow the view. Browser checks showed two matching QA orders while excluding two N/A rows, and unchecking the filter restored all four QA rows. Replacing Copycount with 9876543 displayed 9,876,543 in Entry and Master. Disposable imported reports were removed afterward. ESLint, TypeScript, reporting checks and the final v0.3.2 Docker production build passed.
