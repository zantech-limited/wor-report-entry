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

## Deferred ideas

Consider report backups, sortable Master columns, and duplicate WOR/serial notices after the cleanup. Do not alter workbook semantics or add new reporting charts in this pass.
