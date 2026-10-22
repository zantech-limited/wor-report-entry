# Approved technician entry implementation

Based on the approved 2026-10-22 design. Keep production unchanged until release checks pass.

1. Correct revenue/customer filtering, remove FTF PDF content, make the supplementary register landscape, and support inclusive report ranges. Verify calculations and rendered PDFs.
2. Introduce maintained email/password authentication and additive workflow tables, pending approval, canonical technician linking and four server-enforced roles. Secure every existing API/page. Test guessed IDs, inactive accounts and last-Admin protection.
3. Implement narrow versioned job editing, schedule links, immutable signed snapshots, exact customer form preview/PDF, amendment notifications and a durable SMTP outbox. Test transactions, signatures and retries.
4. Add mobile navigation, schedules, technician alerts and Admin account/SMTP management.
5. Add PWA shell and user/database-partitioned IndexedDB drafts, signatures, explicit reconnect review, idempotent upload and conflicts. Verify restart, multi-tab, offline and quota failure recovery.
6. Replace filesystem durability assumptions for Vercel; preserve Docker testing and remote database compatibility. Extend backup/restore and migration coverage.
7. Run security and bug audits; fix findings and verify affected paths. Build Docker and Vercel-compatible artifacts, render PDFs, and verify existing Excel/recovery regressions. Publish only tested changes; record external SMTP/Vercel setup requirements accurately.
