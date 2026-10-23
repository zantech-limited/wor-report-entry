# Work order form and reliability fixes

Approved 2026-10-22. Prioritize alignment with the supplied paper form and efficient mobile use.

Use the supplied image as the customer form background. Share coordinates between editable web fields and PDF output, preserving the logo and all printed sections. Provide fit/zoom controls, accessible field labels and fullscreen signatures. Keep operational controls available separately. Preserve long text with continuation pages in exported PDFs.

Automatically synchronize unsigned device drafts after a short idle interval and reconnect. Keep encrypted offline recovery, revision checks and explicit review before submitting/emailing signed work. Preserve in-flight edits and never overwrite a conflict automatically.

Allocate short WRETO-prefixed numbers transactionally. Keep historical numbers and signed snapshots intact. Handle empty/non-JSON responses without losing status codes. Investigate production storage errors and verify SQLite backup restore in isolated local storage; Vercel requires durable remote storage.

Validate with type/lint checks, existing field workflow/offline/backup/PDF checks, targeted regressions and visual inspection of the template.

Admin layout editing operates directly on the paper form: move and resize fields, change font size and line spacing, then publish a revision shared by the web form and PDF. Layout changes refresh when an online tab becomes visible. Service options are mutually exclusive and marked with a red circle. The request number is bold red, and both it and the No Charge notice use larger type.

Release checks (2026-10-23): production build, TypeScript, ESLint, PDF regression checks, field workflow, offline acknowledgement, backup import, response handling and layout validation passed. The temporary form-check route was removed from the release. Deployment requires access to the existing wor-report-entry project in the tim-test scope; the Vercel connector returned 403. Live storage configuration and production behavior remain unverified until that access is available.
