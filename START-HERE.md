# GENEVIEVE Business Pattern, Waste & Prevention Command™

This folder is a deployable Next.js + PostgreSQL application built from the supplied `genevieve_system.py` macro-system specification.

## What is already working

- Command dashboard with active matters, overdue escalations, expenditure and evidence counts.
- Persistent operational matter repository.
- Cost ledger with supplier, hourly-rate, hours and direct-cost fields.
- Evidence metadata workspace with checksum and human-verification status.
- One-way human evidence verification action.
- Hard closure gate: a matter cannot become `CLOSED` unless at least one evidence record exists and every evidence record is verified.
- Database-level closure guard, so the rule is not only a front-end rule.
- Recurrence/reopen control for previously closed matters.
- Shared asset registry duplication check.
- Cost-of-inaction calculator.
- GENEVIEVE advisory-only analyst output.
- Append-only audit timeline; PostgreSQL rejects update/delete attempts on audit records.
- Optional deployment access key (`APP_ADMIN_KEY`).
- Responsive operator interface for desktop and phone.

## Important scope boundary

This is a **deployment-ready application foundation**, not a declaration of legal, privacy, Medicare, NDIS, WorkCover, clinical or cybersecurity certification.

The current evidence workspace stores **metadata and checksums only**. It intentionally does not upload or store Medicare/PRODA clinical documents and it does not collect PRODA credentials. Before storing real health, workforce or government information, add a properly designed identity/RBAC system, secure document storage, retention/deletion rules, privacy assessment, penetration/security review, backup/restore plan, incident response and the controls required by the organisation using it.

The AI Analyst in this build is deterministic summary logic. It is labelled advisory-only and cannot approve expenditure, close matters, make employment decisions or replace authorised human review.

---

# Easiest deployment path: GitHub + Neon + Vercel

## Part 1 — Create the database in Neon

1. Sign in to Neon and create a PostgreSQL project/database.
2. Open Neon's SQL Editor.
3. Open this project file: `database/schema.sql`.
4. Copy the entire SQL file into the Neon SQL Editor.
5. Run it once.
6. Copy your Neon PostgreSQL connection string. You will use it as `DATABASE_URL` in Vercel.

The schema automatically creates a demonstration entity called `GENEVIEVE-DEMO`. You can create your real entities later.

## Part 2 — Put this project into GitHub

1. Unzip the ZIP supplied by ChatGPT.
2. In GitHub, create a new repository, for example:
   `genevieve-macro-system`
3. Upload **the contents of this folder** to the repository root.
4. Commit the files.

At the repository root you should see `package.json`, `app`, `components`, `database`, `lib`, and this `START-HERE.md` file.

## Part 3 — Deploy with Vercel

1. In Vercel choose **Add New → Project**.
2. Import the GitHub repository you just created.
3. Vercel should detect **Next.js** automatically.
4. Before deploying, open **Environment Variables** and add:

   - `DATABASE_URL` = your Neon PostgreSQL connection string.
   - `APP_ADMIN_KEY` = a long private random password/key.
   - `DEFAULT_OPERATOR_ID` = e.g. `TRACEY_ADMIN` or an organisational operator identifier.

5. Deploy.
6. Open the Vercel URL.
7. If `APP_ADMIN_KEY` is configured, the first screen asks for the access key and operator ID.

## Generate a strong APP_ADMIN_KEY

You can generate one locally with:

```bash
openssl rand -hex 32
```

Do **not** commit the real key or the real `DATABASE_URL` to GitHub.

---

# Run locally instead

Create `.env.local` from `.env.example` and add your real Neon connection string.

Then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production build test:

```bash
npm run typecheck
npm run build
```

---

# How to use the app

## 1. Create a matter

Choose **Create matter**. Enter a title, category, accountable owner, funding stream, deadline and a privacy-minimised description.

## 2. Record costs

Open the matter and use **Record cost**. The app writes both the cost entry and a separate audit event.

## 3. Record evidence

Add evidence metadata: document type, checksum and source/author. You can mark it verified immediately only if an authorised human has actually reviewed it.

If it was entered as unverified, use **Verify as authorised human** later. Verification is one-way; after verification the database prevents the evidence metadata from being altered.

## 4. Attempt closure

Choose **Attempt verified closure**. PostgreSQL itself checks the rule:

- at least one evidence record must exist; and
- every evidence record for that matter must be verified.

If the condition fails, closure is rejected.

## 5. Recurrence trigger

For a closed matter, choose **Trigger recurrence review**. Enter the anomaly/recurrence reason. The status becomes `REOPENED_FOR_HUMAN_REVIEW` and an audit event is appended.

## 6. Prevention tools

The **Prevention tools** screen contains:

- Shared registry duplication cross-check.
- Cost-of-inaction calculation.
- GENEVIEVE Business AI Analyst advisory statement.

All outputs are decision support only.

---

# Project structure

```text
app/
  api/
    audit/
    dashboard/
    duplication/
    matters/
  globals.css
  layout.tsx
  page.tsx
components/
  DashboardApp.tsx
database/
  schema.sql
  demo_seed.sql
lib/
  auth.ts
  db.ts
  http.ts
reference/
  genevieve_system.py
.env.example
package.json
START-HERE.md
vercel.json
```

# Next production upgrades

For use with live sensitive organisational data, the next engineering phase should add:

1. Full user authentication and role-based access control rather than a single admin key.
2. Entity/department/location administration screens and least-privilege permissions.
3. Approved encrypted document/object storage with malware scanning and lifecycle policies.
4. Cryptographic file hashing in the upload pipeline rather than manually entered checksum fields.
5. Dual-control or delegated verification for high-stakes closure classes.
6. Write idempotency keys for all mutation endpoints.
7. Request rate limits, security headers, CSRF/session controls as appropriate to the chosen auth architecture.
8. Backups, restore drills, monitoring, structured logs and alerting.
9. Data-retention, correction, deletion, legal-hold and export workflows.
10. Formal privacy, security and domain compliance review before real Medicare/NDIS/WorkCover data is introduced.

