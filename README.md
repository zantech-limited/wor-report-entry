# Monthly service reports

A keyboard-first desk for the monthly field-service workbook. Work orders are entered in a form that follows the Master sheet, saved in SQLite, and exported as `.xlsm` so the existing prefix-map macro still runs in Excel.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The dev server listens on port **43123**. No account and no API key are required.

Reports are stored in `data/reports.sqlite`, which is created on first launch and is not in git. Workbooks are not in git either: they contain customer rows. Keep the August workbook on disk at `templates/monthly-service-report.xlsm`. A blank month exports from that file so the macros and prefix map survive. A month you imported exports from the copy stored in the local database.

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

Customer names, sites, and technicians from the template workbook are loaded the first time the app starts. Names you type, and names in later imports, are remembered after you save.
