# Monthly service reports

A keyboard-first desk for the monthly field-service workbook. Work orders are entered in a form that follows the Master sheet, saved in SQLite, and exported as `.xlsm` so the existing prefix-map macro still runs in Excel.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The dev server listens on port **43123**. No account and no API key are required.

Reports are stored in `data/reports.sqlite`, which is created on first launch and is not in git. Workbooks you import stay on this machine too. They are gitignored because they contain customer rows.

`templates/monthly-service-report.xlsm` is part of this repo. It is a blank Master sheet: the title block, formulas, validation lists, prefix map, and macros are there, and the work-order rows are not. A new month exports from that file. A month you imported exports from the copy stored with that month. You do not need to add a workbook by hand before the first export.

## Pages

- `/` Entry, the work-order form
- `/master` every saved work order, with search and filters
- `/statistics` jobs, hours, customers, technicians, and the date span
- `/reports` a technician report, a customer report, and totals by month

## What you can do

- Start a blank month or import another `.xlsm` / `.xlsx` with the same Master sheet.
- Tab through a work order. Customer, Location, and technician fields filter as you type and still accept a new name.
- If a customer has one known site, Location is filled in. If they have several, the Location list is only those sites.
- A customer with past visits offers that company’s serial numbers. Choosing one fills the serial, the model from the prefix map (or the historical model when the prefix is unknown), and Location when every visit for that serial used the same site. Typed model and location stay as they are until you pick a machine on purpose.
- Export `.xlsm`. The file keeps the template’s macros, PrefixMap columns, and Master table (`Table2`). Pivot caches are not rebuilt.

The blank template does not load customer, site, or technician names. Names you type, and names in a workbook you import, are remembered after you save.
