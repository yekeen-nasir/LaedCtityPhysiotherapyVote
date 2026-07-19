# LaedCtityPhysiotherapyVote

A web-based student election platform built for the Physiotherapy Students Association at Lead City University, Nigeria. Designed as a **reusable single-tenant template** — the same codebase can be redeployed for other associations by spinning up a fresh Supabase project, with no multi-tenancy logic baked into the data model.

## Stack

- **Frontend:** Plain HTML/CSS/JavaScript (no framework), Supabase JS client loaded via CDN using ES module imports
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **Hosting:** Netlify (frontend), Supabase (backend)
- **Supabase project ref:** `mfwxtgjkrviylxyyuhho`

> The site must be served (Netlify, or VS Code Live Server locally) — it cannot be opened as a `file://` URL, since ES module imports require a real HTTP context.

## Project Structure

```
LaedCtityPhysiotherapyVote/
├── index.html                 → student login
├── vote.html                  → voting screen
├── results.html                → student-facing results view
├── admin/
│   ├── login.html              → admin login
│   └── dashboard.html          → branding, students, positions/candidates, results/publish
├── css/
│   └── style.css
├── js/
│   ├── supabase-client.js
│   ├── auth.js                 → student login logic
│   ├── admin-auth.js           → admin login logic
│   ├── vote.js                 → voting logic
│   ├── admin.js                → admin dashboard logic
│   ├── admin-ui.js             → sidebar/tab UI behaviour (no data logic)
│   └── results-shared.js       → shared bar-chart renderer (used by admin + student results)
├── supabase/
│   └── functions/
│       └── create-student/
│           └── index.ts        → Edge Function: registers students (single or bulk CSV)
└── assets/
    └── logo-placeholder.png
```

## Core Features

- **Admin dashboard:** association branding (name, description, logo), student registration (single or bulk CSV), positions & candidates management, live results preview, publish/unpublish toggle
- **Student login:** matric number + full name (no separate password — see *Authentication Model* below)
- **Voting:** partial ballots supported (students can vote position-by-position); enforced voting window via `election_settings`
- **Ballot secrecy:** students can never see which candidate they voted for after the fact — only *which positions* they've completed, via a security-definer RPC
- **Results:** aggregate vote counts only, never individual ballots, via a security-definer RPC; hidden from students until admin publishes

## Authentication Model

There are two separate login flows, both built on Supabase Auth using **fake emails** (`{matric_number}@physiovote.local`) since students don't have real email accounts on file.

- **Students** log in with **matric number + full name** — no traditional password. The Edge Function derives a deterministic Auth password at registration time from `normalize(matric_number) + normalize(full_name)`, and the frontend reproduces the identical value at login. Normalization = trim, lowercase, strip whitespace.

  > ⚠️ **Known tradeoff:** matric numbers and names are not secrets — they're often known among classmates. This login scheme was a deliberate client decision to prioritize ease of access over strict per-vote authentication. If reused for a higher-stakes election, revisit this.

- **Admins** log in with a real email + password, created manually (Supabase Dashboard → Authentication → Add user, then insert a matching row into the `admins` table with the new user's `id`). There is no self-service admin signup — this is intentional.

## Database Schema (high level)

| Table | Purpose |
|---|---|
| `association` | Single-row branding: name, description, logo URL |
| `admins` | Admin user IDs (linked to `auth.users`) |
| `students` | Student profile data (linked to `auth.users` via shared UUID) |
| `positions` | Election positions (e.g. President, Secretary) |
| `candidates` | Candidates per position, with photo + bio |
| `election_settings` | Voting window, results-published flag |
| `votes` | Individual ballots — insert-only, immutable, unique per `(student_id, position_id)` |

Two custom Postgres RPCs (both `security definer`):
- `get_voted_positions()` — returns only which positions a student has voted on, never their choices
- `get_results()` — returns aggregate vote counts per candidate, gated by the publish flag for students

## Row Level Security

RLS is enabled on every table. Summary:
- `association`, `positions`, `candidates`, `election_settings` — public/authenticated read, admin-only write
- `students` — self-read only, admin-managed (registration goes through the Edge Function using the service role, bypassing RLS)
- `admins` — self-read only, **no client-side write path at all** (additions/removals must go through the Supabase SQL Editor)
- `votes` — insert-only for students (own votes only), no update/delete for anyone; admins currently retain raw `SELECT` access to individual ballots as a deliberate audit-trail decision (see tradeoff note below)

> ⚠️ **Known tradeoff:** admins can see which student voted for which candidate via direct table access (kept intentionally for audit purposes). This is a deliberate deviation from full ballot secrecy — flagged here so it isn't rediscovered as a "bug" later.

Storage (`branding` bucket): public read, admin-only insert/update.

## Student Registration

Admins register students via the dashboard — either one at a time or via bulk CSV upload (`matric_number,full_name` with a header row). Registration goes through the `create-student` Edge Function, which:
1. Builds the fake email from the matric number
2. Derives the Auth password from matric number + full name
3. Creates the Supabase Auth user (auto-confirmed, no real email verification needed)
4. Inserts the matching `students` row
5. Rolls back the Auth user if the DB insert fails, to avoid orphaned logins

The function is authorized via a shared secret (`ADMIN_FUNCTION_SECRET`) sent in the request body — a deliberate simplicity tradeoff for this scale, flagged in code comments as upgradeable to session-based JWT verification if this template is reused for a larger deployment.

## Deployment

- **Frontend:** connected to Netlify via GitHub — push to the main branch and Netlify auto-rebuilds
- **Edge Functions:** deploy manually via the Supabase CLI from the project root:
  ```
  supabase functions deploy create-student
  ```
- **Database changes:** run directly via the Supabase SQL Editor

## Reusing This as a Template

Since there's no `association_id`/multi-tenancy logic anywhere in the schema, reusing this for a different school or association just requires:
1. Spinning up a fresh Supabase project
2. Re-running the schema + RLS policies
3. Re-deploying the `create-student` Edge Function with a new `ADMIN_FUNCTION_SECRET`
4. Updating `supabase-client.js` with the new project's URL and publishable key
5. Creating a fresh admin account manually

## Known Open Items

- Logo/candidate photo uploads use timestamped filenames rather than overwriting — old files accumulate in the `branding` storage bucket over time with no automatic cleanup
- Deleting a position/candidate with existing votes will hit a foreign-key error from `votes` — currently handled with a confirm dialog and the raw DB error, not a dedicated UI guard
- `ADMIN_FUNCTION_SECRET` lives in plaintext in `admin.js` (unavoidable for a static frontend with no build step) — rotate periodically, especially after sharing code/screenshots