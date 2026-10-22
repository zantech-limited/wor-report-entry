# Technician entry, signed work orders and offline PWA

Status: extension of the existing app/database approved in conversation; detailed workflow design ready for review. Application code and production remain unchanged by this document.

## Intent and confirmed constraints

Extend the existing service desk into a local-testable field service system. Preserve existing jobs, workbook exports, secondary technician hours, entry defaults, shared database support and stale-save protection. The user supplied a Work Order Request image as the layout reference. Its labels are document content; the user's message defines the behavior.

The user confirmed Vercel HTTPS hosting with the existing Supabase database and SMTP-only email settings; Google/Microsoft OAuth is excluded. Local Docker remains available for isolated tests. No customer email is sent during testing by default. Local delivery uses a mail catcher; an explicit Admin test sends only to the address entered for that test.

## Approach and delivery boundaries

Recommended: extend the Next.js application with accounts, per-job permissions, additive workflow storage and a mobile workspace. Retain the monthly workbook as the reporting/export projection rather than allowing technicians to replace entire workbooks.

Alternatives considered: a separate mobile frontend would duplicate UI and synchronization work; a full replacement would add avoidable migration and export risk.

Deliver in dependency order, with separate verification gates:

1. Correct the current PDF output and introduce day/range/multi-month selection.
2. Add accounts, approval, permissions, secure legacy endpoints and technician lifecycle management.
3. Add the reference form, immutable signed revisions, previews and SMTP email delivery.
4. Add schedules, alerts, durable offline drafts and reviewed synchronization.
5. Complete security/bug audit, remediation, mobile and Docker verification before promoting the release.

Each subsystem receives an implementation checklist and tests before its code changes. Production remains on its working image until the combined migration and restore checks pass.

## PDF corrections

- Customer revenue tables and customer revenue graphs include only customers with at least one nonzero revenue job in the selected period. Overall job and technician totals still include non-chargeable work. Customers with adjustments remain visible even when their net revenue is zero.
- Remove first-time-fix rates, response graphs and FTF lines from generated management PDFs and customer forms. Keep historical FTF values in storage and workbook exports for compatibility.
- Show revenue broken down by normalized recorded payment methods: P.O., Cash, Cheque, Online, Showroom and other actual methods. Do not infer payment collection. Zero-only payment categories are omitted from revenue presentation.
- The parts/billing/notes appendix includes a job only when it has a nonzero revenue amount, substantive notes, a part number or a parts description. Whitespace, No charge, zero revenue and N/A FTF alone do not qualify.
- Make that appendix landscape, with adequate widths and repeated headers. No FTF column or line. Keep long notes on continuation pages without shrinking them into unreadable text.
- Reports allow one month, a month range, or an inclusive day range. Filtering uses the job date in Trinidad and Tobago time; optional undated inclusion remains explicitly labeled. Manager and Admin have full range exports. Historical calendar-month exports remain available.

## Accounts and permissions

Interpret the role list as four roles: Tech, Supervisor, Manager and Admin. A user has one active role, set on the server by Admin; registration cannot choose a privileged role.

- Tech: view their assigned schedule and owned/assigned jobs; create jobs under their identity; edit their unsent drafts; capture customer sign-off; review and submit; read and acknowledge their alerts. A secondary tech can see an assigned shared job but cannot silently replace its lead technician or signed content.
- Supervisor: view all jobs and previews; create, assign and reschedule visits; send targeted or team alerts; inspect job activity. No storage credentials, account-role control, bulk deletion or privileged work-order edits by default.
- Manager: view all jobs and generate management reports for selected days/months; inspect customer forms and delivery history. No account administration or infrastructure settings by default.
- Admin: all capabilities, account approval and role assignment, technician add/archive/remove, historical account linking, work-order amendments, email/storage settings and audit access.

Registration uses email/password and email verification. It creates a pending account with no job access. Admin approves the registration and links it to a canonical technician identity, or archives/rejects it. Admin can invite or add a technician without creating duplicate historical names. Account IDs, not editable technician display names, determine ownership. Imported technician names do not automatically become login accounts.

Use a maintained authentication library with server-side sessions, email verification and password reset. Better Auth is the proposed library because its supported databases cover SQLite, PostgreSQL/Supabase and MySQL. Pin and audit the chosen version during implementation. Its adapter must use the selected shared database and participate in backup/migration; do not create a separate local-only account store when jobs use a shared database.

Revoke sessions immediately when an account is archived, disabled or loses access. Removal archives the identity and blocks login while retaining job authorship, signatures and audit history. Do not hard-delete technicians referenced by history. Prevent removal/demotion of the last active Admin.

Bootstrap the first named Admin using the existing secret through a limited local setup route. After activation, the shared token cannot access normal job data or bypass role checks. Deployment includes an explicit private recovery procedure to avoid locking out the owner.

## Security boundary and current findings

Inspection found that existing report GET/PUT/DELETE and import routes have no individual account or ownership checks. They are suitable only for the existing trusted local desk; they must be secured before introducing technician accounts or network access. Hiding navigation is insufficient.

Authorize every page, API, export, preview, signature, schedule, catalog, alert, backup and email action on the server. Legacy monthly-workbook PUT/import/delete becomes Admin-only. Technicians use a narrow job API which locks the containing workbook, validates the job revision, checks assignment and changes only the permitted job. Never accept role, owner, signed status or approval from client claims.

Use secure HttpOnly cookies in HTTPS deployments, trusted configured origins, CSRF protection, persistent shared login/reset/registration rate limits, strict payload limits, safe error messages and secret redaction. Passwords and encryption secrets are never returned by Admin settings. Keep database/service credentials out of browser bundles. Signature blobs have size/type constraints and are private.

Retain revision checks and conflict responses. Update the job, workbook projection, history and audit event atomically in one shared database transaction. Extend portable backup, restore, remote storage migration and rollback to all new account/workflow records and private assets. Account/session tables must not be accidentally exposed through ordinary workbook exports.

## Work order data and form mapping

Introduce a workflow record keyed by the existing immutable work-order ID. Add new fields without changing the Excel Master column order. Imported jobs retain their IDs; missing workflow/contact fields remain blank. Technician-owned work created on mobile projects into the appropriate monthly workbook based on job date.

Map the reference form as follows:

- Header: Zantech logo/contact block, Work Order Request title and request number replacing XXX in bold red type. Use an existing WOR where supplied. For newly created jobs, use a unique request reference bound to the immutable job ID and retained across retries. Offline jobs receive a collision-resistant provisional reference that remains recorded if a later business number is assigned; do not renumber a signed customer copy silently.
- Client Worksite Details: client name and separate client/worksite address. Preserve existing customer/location fields, with explicit address entry rather than guessing addresses from site names.
- Order Details: scheduled date, phone, requester name, requester email, technician(s), description of work required. Keep scheduling and actual service date distinct.
- Details of Work Carried Out: dedicated rich-length plain text field, separate from parts descriptions and internal notes. Internal notes never appear in the customer PDF.
- Material Used: structured part number, description and quantity lines using the current parts catalog. Existing line-separated parts remain readable and exportable.
- Equipment Used: model, serial, comma-formatted copy count, service/SLA and billing choices mapped to the labels on the reference. PO and other existing billing methods remain supported even if absent from the paper choices.
- Other Work Performed and Other Work Needed: separate customer-visible text fields.
- Completion Information: actual start date/time and completion date/time, with overnight and multi-day validation.
- Completed By: technician printed/typed name, designation, date and optional drawn signature. Provide typed-name entry and pointer/stylus signature capture.
- Approved By: customer printed name, designation, date and drawn signature captured by finger or pen. Include a clear acknowledgement of the displayed work; never treat an unlabelled scribble as approval.

Build the layout as vector/text PDF content and a matching HTML preview, using the supplied image as the visual reference. Reuse an authentic available logo asset; do not crop/reuse the entire screenshot as a blurred PDF background. Provide a logo upload setting if a clean logo cannot be sourced from the repository.

Use fixed section boundaries and measured font wrapping. Put body text above each ruled baseline, never over headings or adjacent boxes. Long content flows to labeled continuation pages with the same request number. Signatures stay within their labeled boxes without distortion. Do not truncate a work description to preserve a one-page layout.

Desktop job history opens a side panel with a compact form preview; mobile opens a full-screen preview. Both offer the full readable customer PDF and revision history. Public customer links are not required: use private authenticated previews and an emailed attachment.

## Review, signatures and amendments

Workflow: draft -> customer sign-off captured -> technician final review -> submitted -> customer copy queued -> sent/failed.

The customer signs the exact customer-visible content shown in the preview. Store its immutable snapshot/hash, customer acknowledgement, author, signature asset and timestamp. Technician final review confirms the recipient and signed content before requesting delivery. Never email solely because autosave occurred.

Changing customer-visible content after signing invalidates that sign-off for the edited version and requires fresh approval before the replacement can be represented as customer-approved. Preserve the originally signed version and original email. Admin edits produce a new revision, actor/reason/diff audit and a notification for every assigned technician. Internal-note-only edits do not alter customer approval.

Historical signed copies are immutable; the current preview identifies an amendment and whether reapproval is needed. Signature timestamps and account attribution are evidence of app activity, not claims of identity verification beyond what the app actually performs.

## Email settings and delivery

Admin selects Disabled/Test or SMTP. Show sender address/name, reply-to, test recipient, delivery queue and last error. SMTP accepts host/port/user/password and verified TLS settings; require TLS in live mode. Never disable certificate verification as a convenience. Use an SMTP provider that accepts authenticated connections from the host. Google/Microsoft OAuth and connection buttons are out of scope.

Create a durable outbox entry only after the job revision is committed and reviewed. Key deliveries by job revision, recipient and explicit send attempt. A worker claims queue rows atomically, retries bounded transient failures and exposes ambiguous outcomes for review instead of claiming exactly-once delivery across an SMTP disconnect. Show Queued, Sending, Sent, Failed and Delivery uncertain states. A retry reuses the same frozen PDF. Never silently send an altered revision or broadcast to all customers.

On Vercel, attempt a bounded delivery after the reviewed submission is durably queued, with retries through an authenticated scheduled endpoint. Confirm the selected Vercel plan supports the required retry interval; do not assume frequent cron runs are available. Also expose manual retry to authorized staff. On Docker, the same outbox can use a worker process with the same private database configuration. Back up its encryption key separately from data; all containers sharing accounts/outbox must use the same configured key. Production secrets are environment/private-file settings, not image layers or Git files.

## Scheduling and notifications

Supervisor/Admin create visits with assigned technician(s), customer/site, local start/end time, work required and status. Warn about overlapping assignments and prevent end-before-start errors. Schedules link to jobs by stable ID; creating work from a schedule pre-fills the permitted contact and scope fields. Rescheduling does not change actual work timestamps or signed history.

Persist alerts with sender, recipients, severity, content, related job/schedule, creation and acknowledgement. Display unread alerts on login and in an inbox; use a visible banner for urgent alerts without losing the current draft. Poll while the app is visible, with retry/backoff. Show offline/last-refreshed status; offline devices cannot receive new alerts until connected. Do not require OS push permission for the requested on-screen alerts. Push outside the app is a separate optional extension.

## Offline PWA and synchronization

Provide a web manifest, icons, install guidance, app-shell service worker and account-scoped IndexedDB drafts. Cache only static public shell assets in the service worker; never cache Admin pages, credentials, session endpoints, whole-database exports or authenticated HTML indiscriminately.

After a successful online login, the user can explicitly make assigned jobs/schedules and limited lookup data available offline. Offline mode permits drafting and signature capture against the shown local snapshot. Display Saved on this device distinctly from Saved to server and Customer copy sent. First-time login, approval, password reset, role changes and email delivery require a connection.

Persist draft content, signature blobs, base revision and client operation UUID atomically. Catch quota/write errors before showing a saved indicator. Request persistent storage where supported, and provide a recovery download. Browser storage can still be cleared or evicted; never promise an offline draft is a server backup.

When connection returns, show Review uploads with each pending draft, signed preview, recipient and any server changes. The technician explicitly selects and uploads reviewed items. Do not background-upload or send customer emails merely on reconnect. Retry the same operation UUID after timeouts; the server stores an acknowledgement so repeated requests cannot duplicate jobs, parts usage or delivery requests.

Conflict handling compares server/base revisions under a lock. Present local/server changes and retain both versions; do not overwrite newer data. If assignment was removed or account disabled, reject upload while preserving a recovery path. Upload acceptance and delivery queueing are separate visible acknowledgements. Retain local data until the server acknowledgement is durable.

Partition local records by database identity and user ID. Lock access after offline inactivity; require online reauthentication before syncing after session expiry. Do not permit a different signed-in user to browse another user's drafts on a shared iPad. Logout warns about unsynced work and offers sync/recovery/explicit discard rather than silently deleting it. Online revocation cannot remotely erase a disconnected device; keep offline data restricted and expose that limitation in device setup.

Avoid destructive service worker upgrades while drafts are open. Notify that an update is ready, flush local state, and activate after the user finishes or chooses reload.

## Vercel deployment and local testing

Vercel hosts the existing Next.js application and provides the HTTPS origin used for phone/iPad installation. Keep Supabase as durable shared storage; never use a local SQLite file or /tmp as hosted production storage. Use server-only environment variables for DB connection details, verified CA, account session/encryption secrets and bootstrap access. Configure the final allowed origin after the Vercel project URL is known. Preview deployments must use an isolated database and test SMTP settings, not the live customer database.

Use the Supabase transaction pooler for serverless functions and a small per-instance connection pool. Avoid session-scoped database state and named prepared statements; transaction locks remain within explicit transactions. Test concurrent instances and cold starts.

Move recovery history, notification state, email configuration, signature assets and signed snapshots from assumptions of a persistent /app/data folder into durable database/private object storage. For the first release, bounded signature data and signed snapshots can be stored privately in database tables; frozen PDFs can be generated deterministically from the immutable snapshot. Backups include all these records. Bound database/PDF sizes; use authenticated streaming/download paths for exports that exceed platform response limits rather than truncating data.

Hide/disable Docker restart and filesystem-based storage-switch controls on Vercel. Remote storage settings come from deployment environment variables; runtime email settings use encrypted database records. Do not expose the old unauthenticated desk publicly while the new authorization layer is unfinished. Vercel hosting is a deployment target, not evidence the app is already safe for public access.



Keep the current production image and database untouched while implementing in isolated Docker containers/test databases. Test mail uses a local mail catcher and synthetic contacts. Never use existing customer addresses as automated test destinations.

Normal desktop localhost can exercise service workers. A phone/iPad accessing plain HTTP at a LAN IP cannot exercise full PWA/offline behavior; provide a separate optional local HTTPS proxy with a certificate trusted by test devices. Do not weaken certificate checks or claim a manifest alone makes LAN HTTP fully offline-capable. SMTP credentials are entered privately in Admin after deployment; they are not requested in chat.

Before enabling account protection in the production volume: make and verify a backup, bootstrap a named Admin, link historical technician identities, migrate additive tables, verify all legacy job content and test rollback. No default/shared passwords and no automatic deletion of test-looking production work orders.

## Verification and audit acceptance

- PDF fixtures: zero-only customers omitted from revenue output; PO/Cash separate; no FTF text; appendix only revenue/parts/notes, landscape; date boundaries, multi-month range, long content and accents. Render and inspect the reference form with every field populated and with overflow.
- Authorization: anonymous rejection, pending/archived rejection, all four roles, guessed job/workbook IDs, secondary assignments, forged owner/role, import/export/backup endpoints and the last-Admin safeguard.
- Signatures: mouse/finger/stylus, resized/rotated screen, blank signature rejection, immutable snapshot, amendment invalidation and private asset access.
- Offline: cold open after prior login, reconnect review, app close/reopen, quota failure, multiple tabs, account switching, session expiry, removed assignment, duplicate retries, interrupted upload and conflicting Admin edits.
- Email: local catcher delivery, attachment rendering, sender/recipient validation, SMTP secret redaction, rejected credentials, retry and ambiguous-send behavior.
- Storage: SQLite, PostgreSQL/Supabase and MySQL migrations; shared session/revocation behavior; backup/restore of new data and assets; atomic workbook projection; existing Excel roundtrip, template integrity and recovered-entry regression tests.
- Security audit: dependency advisories, injection/XSS/CSRF, object-level access control, privilege escalation, rate limits, signature validation, private caching, logs and secret handling. Fix actionable findings and rerun affected checks before release.
- Bug audit: state transitions, lost drafts, stale workbooks, duplicate sync/email, scheduling timezone boundaries, report totals and PDF layout. Record unresolved external configuration blockers accurately; do not label unconfigured SMTP delivery as tested.

## Design assumptions for approval

New users remain pending until Admin approval; the four roles have the permissions above. Customer-visible amendments require a fresh customer signature. Revenue filtering applies to revenue sections, not the complete service activity register. Vercel with the existing Supabase database is the hosting direction, Docker remains for local testing, and real SMTP email delivery is disabled until configured. These are intentional defaults inferred from the request, not changes already deployed.

## Primary references checked

- Better Auth installation/database support: https://better-auth.com/docs/installation
- Service worker secure-context requirement: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- Browser storage quotas/persistence limitations: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

- Vercel function runtimes and filesystem: https://vercel.com/docs/functions/runtimes
- Vercel scheduled jobs: https://vercel.com/docs/cron-jobs
- Supabase serverless database connections: https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers


## Approved follow-up requirements

Up to six assigned technicians share each job. All six receive history, filtering and on-site hour credit. Excel retains the first two technician columns; additional names append to Comments with separating spaces. Current assignment controls access after reassignment.

Customer PDFs circle the selected SLA/billing options. No charge appears above the bold red request number and leaves all options uncircled. Visible amendments invalidate customer approval; immutable prior signed versions remain available.

Deployment target is https://wor-report-entry.vercel.app, extending the existing database. SMTP is configured in Admin; OAuth is excluded. Routine implementation, verification and deployment decisions are authorized without waiting for further user approval.
