# Version 0.5.0 release verification

This release extends the existing workbook database with approved named accounts, signed work orders and an encrypted device draft vault. Existing workbooks are preserved; the previous Docker container remains available during hosted rollout.

## Verification completed

- Production Next.js build, TypeScript and ESLint passed.
- Existing XLSM roundtrip and template integrity passed, preserving macros, prefix mappings and complete pivot definitions.
- Existing storage, reporting, entry identity, fast-save and stale-save/recovery checks passed. A stale 89-row workbook cannot overwrite 122 acknowledged rows.
- Account/workflow checks passed on SQLite, PostgreSQL 17 and MySQL 8.4 using real Better Auth sessions and isolated databases. They cover pending approval, six-person history and hours, month filtering, unrelated technician exclusion, idempotent operations, conflicting revisions, signed snapshot retention, fresh approval after amendment, reassignment access removal and archived-session revocation.
- HTTP checks cover setup, registration, approval, email verification, restricted legacy routes, signed submission and a real SMTP PDF attachment delivered to a local test mail server. No customer email was sent during testing.
- A production-browser offline test loaded the cached shell with its server stopped, read the six-person job, created a new draft and recovered it after a full reload without uploading.
- Encrypted IndexedDB checks cover wrong passphrases, account/database partitioning, edits made during an upload acknowledgement, recovery import and archived recovery versions.
- A full-system backup restored into fresh SQLite with equal accounts, signed workflow history, workbook rows and database identity.
- Customer PDFs were rendered and visually checked. Automated PDF checks cover six technicians, overflow pages, no-charge options remaining uncircled, removed FTF fields, payment categories and landscape supplementary pages.
- The Docker image builds with native SQLite build prerequisites confined to the build stage. Its separate test container starts and reports healthy.
- The production Supabase transaction pooler accepts a verified TLS connection. A private pre-upgrade backup captured all 16 workbooks before deployment configuration.

## Audits and fixes

Security review identified account tables needing Supabase RLS/revocation during migration/restore, and creator access surviving reassignment. Both were corrected. Bug review identified upload acknowledgements deleting newer device edits, stale customer signatures surviving visible changes, and fresh signatures being rejected on Admin amendments. These were corrected and covered by regressions. Local save failure also blocks automatic/manual locking and warns before navigation.

Production dependency audit reports no known vulnerabilities. Five high advisories remain in the development-only Next ESLint glob dependency chain; the currently published upstream packages do not supply a patched replacement. They are absent from the standalone production runtime. Do not run lint against untrusted external glob patterns.

## Operator setup and limitations

Create the first named Admin at `/setup` with the existing private bootstrap token, then configure SMTP and approve/link technician accounts. Bootstrap is deliberately not completed using an invented personal email or password. Account registration and customer submission attempt queued delivery immediately. A protected daily Vercel cron provides a bounded fallback; Admin can process/retry queued delivery. More frequent scheduling depends on the hosting plan. Ambiguous SMTP delivery requires provider confirmation before retrying.

Install/offline support requires HTTPS or desktop localhost. An ordinary HTTP LAN address cannot install a service worker on phones/iPads. Offline data is encrypted on the device and uploads require review. Browser storage deletion can still remove local drafts; download recovery copies and retain their passphrases.

Customer forms reproduce the supplied layout using selectable PDF text and vector signatures. The header uses a text wordmark; the original shield artwork has not been supplied as a separate production logo asset. Long content continues onto additional pages rather than being clipped.
