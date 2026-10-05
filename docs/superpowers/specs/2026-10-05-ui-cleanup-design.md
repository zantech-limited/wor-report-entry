# Service desk cleanup

Approved direction: restrained UI cleanup, targeted reliability fixes, and Docker validation.

## Options considered

1. Recommended: refine the existing four-page desk, keeping its field order and workbook workflow. Low migration risk and immediately useful for daily entry.
2. Replace the editor with a wizard. More guided, but interrupts fast keyboard entry.
3. Build a dashboard with charts and a new navigation system. Broader change than this cleanup needs.

## Design

Use a quiet neutral background, white panels, a single blue accent, consistent spacing, clear headings, visible keyboard focus, and readable field text. Navigation keeps Entry, Master, Statistics, and Reports. The entry form retains every field and the existing Tab order. Improve the month sidebar, section headings, save feedback, and small-screen action layout. Master gains a clear-filters action and differentiated empty states. Data tables keep semantic headers and readable numeric alignment.

Sources reviewed: https://minimal.gallery/ (gallery overview), https://mobbin.com/ (public overview; detailed authenticated galleries not reviewed), https://practicaltypography.com/typography-in-ten-minutes.html, https://inclusive-components.design/notifications/, https://inclusive-components.design/data-tables/. These inform design choices; no proprietary templates or assets are copied.

## Reliability

Fix the verified save failure loop: failed requests must retain unsaved edits and stop automatic retries until another edit or explicit retry. Month switching must stop when saving fails. Add unload protection for pending edits. Preserve customer/machine autofill, time calculations, primary/secondary technician reporting, SQLite storage, and XLSM macros.

## Delivery and validation

Add Docker configuration with Node 24, a persistent report volume, the tracked blank workbook template, and a separate local test port. Exclude local report data and imported workbooks from the build context. Run lint, TypeScript, production build, workbook roundtrip checks, and browser checks for desktop/mobile, keyboard entry, save failure/retry, filters, and export. Use isolated container data rather than existing user reports.

## Expanded scope approved by the user

Include portable report backups and additive restore, sortable Master columns, and duplicate WOR/serial notices. Add a token-protected Admin page for recent structured application events and storage configuration. Support SQLite (default), MySQL, and PostgreSQL with host, port, database, username, password, and TLS controls. Test connections before saving. Migrations copy reports, workbook source blobs, remembered names, and metadata into an empty destination transactionally and verify the copied data. Save the destination settings only after verification; activation requires a restart. Preserve the source and write a local backup before migration. Pause writes after preparing a migration until restart so edits cannot be stranded in the source.

Administrative credentials come from ADMIN_TOKEN; absent that setting, generate a random local token in the private data directory for the operator to read. Use an HttpOnly same-site session cookie and same-origin checks on mutations. Never return storage passwords or include work-order content in logs. File-based connection settings stay in the ignored data directory; environment variables are recommended for deployment secrets. The service desk itself remains a local trusted-user app; admin authentication does not add user accounts to Entry.

Docker testing uses isolated databases for all three adapters and synthetic report rows. Keep the app bound to loopback on the host. Preserve workbook semantics; the later approved reporting scope below adds optional charts.

## Parts catalog

Maintain part number, single-line description, default quantity, and active/archive status in Admin. Entry retains its existing multiline Part No., Description, and QTY fields. Exact typed matches fill empty description/quantity rows; a deliberate catalog pick replaces only the corresponding line. Enter chooses a highlighted match and Alt+Enter inserts a newline. Workbook export writes these values to the same cells with line breaks, matching Excel's Alt+Enter layout. Include catalog rows in portable backups and all storage adapters.

## Further user-approved additions

Provide dedicated Technicians, Parts, and Prefixes pages readable and searchable by every user. Only mutations require the Admin session. Removing a technician hides future dropdown suggestions and preserves past assignments; restoring or renaming suggestions is supported. Prefix edits apply to the selected month only. Reports gain inclusive date-range filters, explicit undated inclusion, optional graphs of monthly jobs/hours and service mix. All summaries use the same range. Primary and secondary assignments receive the full on-site duration; a technician named in both fields is counted once per visit. Overall on-site hours count each visit once. Duplicate references compare WOR and serial only, show the source workbook, customer, and date, and link to matching orders; No. is never used for duplicate detection. Display version 0.2.0 in the header and footer. Add © 2026 Zantech Limited and a persistent red Internal use only notice at bottom left. Test the five user-provided workbooks without modifying originals or adding them to Git/images.
