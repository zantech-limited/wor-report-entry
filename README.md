# Monthly service reports

A keyboard-first desk for the monthly field-service workbook. Work orders are entered in a form that follows the Master sheet, saved in SQLite, and exported as `.xlsm` so the existing prefix-map macro still runs in Excel.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The dev server listens on port **43123**. Reports are stored in `data/reports.sqlite` (created on first launch). The August workbook used as the export template is `templates/monthly-service-report.xlsm`. No account and no API key are required.

## What you can do

- Start a blank month or import another `.xlsm` / `.xlsx` with the same Master sheet.
- Tab through a work order. Customer, Location, and technician fields filter as you type and still accept a new name.
- If a customer has one known site, Location is filled in. If they have several, the Location list is only those sites.
- Export `.xlsm`. The file keeps the template’s macros, PrefixMap columns, and Master table (`Table2`).

Customer names, sites, and technicians from the template workbook are loaded the first time the app starts. Names you type, and names in later imports, are remembered after you save.
