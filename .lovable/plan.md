
# Inspection Package — plan

Today "Inspection package" (Revisjon → Inspection package) only lists what *would* be included and shows a "coming soon" toast. This plan turns it into a real, downloadable inspection package a Luftfartstilsynet inspector can be handed directly.

## Goal

One-click generation of a complete inspection binder for the current company (respecting hierarchy / allowlist), containing:
- A cover PDF with company info, compliance score, and table of contents
- Structured PDF sections per audit category
- Attached source documents (certificates, manuals, insurance, etc.)
- Delivered as a single ZIP the user can download and email to the inspector

## Scope

### 1. UI (`InspectionPackageTab.tsx`)
- Keep the existing sections overview and critical-findings warning.
- Replace the "coming soon" button with a real **Generate package** action:
  - Options (checkboxes): include attached source documents, include incident reports, include audit reviews, redact personal data (names → initials).
  - Date range selector (default: last 12 months).
  - Language selector (NO / EN) — reuses the current i18n language by default.
- While generating: progress state (fetching data → building PDF → zipping → uploading → ready).
- On completion: show a download button + a "Send to inspector" link that opens the existing `ComposeMessageDialog` prefilled with a signed URL.
- History list at the bottom: previously generated packages (last 10) with re-download.

### 2. Data assembly
New service `src/components/admin/audit/services/InspectionPackageBuilder.ts` that gathers everything needed from the existing audit queries (no new fetch logic where possible):
- Company profile (`companies` row + parent chain)
- Compliance score & category scores (from `ComplianceEngine`)
- Personnel + competencies (from `useAuditCompetencies`)
- Fleet: drones, equipment, service status, open log deviations (from `useAuditFleet`)
- Documents index with expiry status (from `useAuditDocuments`)
- Operations: missions summary, open issues (from `useAuditOperations`)
- Safety: incidents summary + closure stats (from `useAuditSafety`)
- Internal audits: reviews + findings + actions (from `useAuditReviews`)

Everything is fetched once, in parallel, scoped by `get_user_visible_company_ids()` so hierarchy rules are preserved.

### 3. PDF generation
Reuse the existing PDF stack (`jspdf` — already used in `oppdragPdfExport.ts` / `riskAssessmentPdfExport.ts`) to build one cover PDF + one PDF per section, ensuring consistent AviSafe branding (logo, colors from `index.css`).
- Cover: logo, company name, org.nr, period, overall score ring rendered as SVG → PNG, generation timestamp, generated-by user.
- TOC with page numbers.
- One section per category (Documentation, Competency, Fleet, Operations, Safety, Internal audits).
- Each finding/row uses the same status colors as the UI (`status-red/yellow/green`).

### 4. Attachments
- Pull document files from the `documents` storage bucket using signed URLs (respecting existing storage RLS).
- Skip attachments the current user cannot download (fail-soft with a note in the PDF).
- Group under `attachments/<category>/<filename>`.

### 5. Packaging & delivery
- Zip everything client-side with `jszip` (already common in the codebase; confirm during build).
- Upload the ZIP to a new storage path `inspection-packages/<company_id>/<uuid>.zip` in the existing `documents` bucket (company-scoped, matching current storage policy).
- Return a 7-day signed URL to the UI.

### 6. Persistence
New table `inspection_packages` to keep history:

```text
inspection_packages
├─ id (uuid, pk)
├─ company_id (uuid, fk companies)
├─ generated_by (uuid, fk profiles)
├─ generated_at (timestamptz, default now())
├─ period_from / period_to (date)
├─ options (jsonb)          -- which sections/toggles were selected
├─ overall_score (int)
├─ storage_path (text)      -- path in documents bucket
└─ file_size_bytes (bigint)
```

RLS: `SELECT/INSERT` only when `has_role(auth.uid(),'administrator'|'superadmin')` and the row's `company_id` is in `get_user_visible_company_ids(auth.uid())`. Standard GRANTs to `authenticated` and `service_role` per project convention.

### 7. Access control
- Feature stays inside the Audit tab, which is already limited to "Moderavdeling" + superadmins.
- Generation button gated to admin/superadmin roles.
- All queries continue to use the caller's session — no service_role in the browser.

### 8. i18n
- New keys under `audit.package.*` (options, statuses, PDF section titles, cover strings) in both `no.json` and `en.json`, per the mandatory i18n rule.
- PDF text follows the selected language.

## Out of scope (follow-up)
- Emailing the ZIP directly from an edge function (we'll rely on the existing internal message flow for now).
- Scheduled/automatic regeneration.
- Digital signing of the package.

## Deliverables checklist
1. Migration creating `inspection_packages` (+ grants + RLS).
2. `InspectionPackageBuilder.ts` service.
3. PDF renderer helpers under `src/components/admin/audit/pdf/`.
4. Updated `InspectionPackageTab.tsx` with real generation flow + history list.
5. i18n keys in `no.json` / `en.json`.
6. Verified typecheck + a manual smoke test on Moderavdeling.
