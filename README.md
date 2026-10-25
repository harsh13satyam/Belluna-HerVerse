# Belluna — Women's Health Companion (working title)

> 🚀 **Live Demo:** [https://belluna-herverse.onrender.com](https://belluna-herverse.onrender.com)

> A privacy-first, Hindi/English web app that helps women **understand** their health, **track** their cycle and symptoms, and **act** when something is wrong — built for recHERsion 2026, Problem Statement 1: Women's Healthcare.

**Status:** deployed · **Stack:** React + Vite + TypeScript · Supabase · Groq · Render

> **Medical disclaimer:** Belluna provides general health education and personal tracking. It does **not** diagnose, prescribe, or replace a doctor. In an emergency call **112** or go to the nearest hospital.

---

## 1. The problem

Women often wait years for a correct diagnosis of conditions such as endometriosis and PCOS (press coverage of an ICMR study cites roughly 7 years for endometriosis in India — verify before quoting on a slide). Contributing factors include normalised pain, low health literacy, language barriers, scarce specialists, stigma, and tracking tools that log data but do not help a woman understand it or decide what to do next.

## 2. What Belluna does

| # | Module | What the user gets | Owner | Priority |
|---|---|---|---|---|
| 1 | **Health Literacy Translator** | Ask a health question in Hindi or English; get a structured, simple-language explanation with trusted-source references and safety notes | Member 1 | P0 |
| 2 | **Period & Symptom Tracker** | Log periods, flow, pain and symptoms; see history, timeline and charts | Member 2 | P0 |
| 3 | **Auth & private profiles** | Secure sign-in; each user's data visible only to them | Member 2 | P0 |
| 4 | **Period SOS** | Short triage questions → clear next step (emergency / see a doctor soon / self-care) | Member 3 (UI) · Member 1 (content) | P1 |
| 5 | **Nearest-doctor finder** | Map of nearby clinics and hospitals (Leaflet + OpenStreetMap) | Member 3 | P1 |
| 6 | **Medicine library & awareness content** | Plain-language info on common medicines and reproductive-health topics, with sources | Member 1 | P2 |
| 7 | **Anonymous peer chat** | Moderated, pseudonymous rooms with report and block | Member 3 (UI) · Member 2 (data) | P2 |
| 8 | **Pattern insights** *(recommended addition)* | Rule-based "worth discussing with a doctor" flags from the user's own logs | Member 2 + 1 | P1 |

Priorities decide what gets cut first. See [`docs/phases.md`](docs/phases.md).

## 3. Documentation

| File | Purpose |
|---|---|
| [`docs/requirements.md`](docs/requirements.md) | Personas, functional and non-functional requirements, safety requirements, acceptance tests |
| [`docs/architecture.md`](docs/architecture.md) | System design, data model and RLS, API contracts, AI safety pipeline, deployment |
| [`docs/phases.md`](docs/phases.md) | Work breakdown per member, integration checkpoints, demo checklist |
| [`docs/rules.md`](docs/rules.md) | Working agreements for the team and for AI-assisted coding, medical-content rules |

## 4. Tech stack

| Purpose | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| UI | Tailwind CSS, shadcn/ui, Lucide React |
| Navigation | React Router |
| Forms | React Hook Form + Zod |
| Backend / database | Supabase (Postgres, Row Level Security) |
| Login | Supabase Auth |
| Live chat | Supabase Realtime |
| Charts | Recharts |
| Maps | Leaflet + OpenStreetMap |
| AI explanations | Groq API (free-tier limits apply) via a server-side proxy |
| PDF export (if needed) | jsPDF |
| Version control | Git + GitHub |
| Hosting | versel Pages (+ Pages Functions for the AI proxy) |

Anything outside this list needs team agreement first — see [`docs/rules.md`](docs/rules.md#2-stack-lock).

## 5. Architecture at a glance

```
 Browser (React SPA on versel Pages)
   │
   ├── Supabase (Auth · Postgres + RLS · Realtime)   ← tracker, profiles, chat
   │
   ├── /api/explain  (versel Pages Function)     ← verifies Supabase JWT, rate-limits,
   │        │                                            safety-screens, calls Groq, validates output
   │        └── Groq API  (key never reaches the browser)
   │
   └── Overpass API + OSM tiles (Leaflet)            ← nearby clinics and map
```

Details: [`docs/architecture.md`](docs/architecture.md).

## 6. Getting started

### Prerequisites
- Node.js (current LTS) and npm
- A Supabase project (free tier; choose the region closest to your users)
- A Groq API key
- A versel account (for deployment)

### Setup
```bash
git clone <repo-url>
cd Belluna
npm install
cp .env.example .env            # frontend variables
cp .dev.vars.example .dev.vars  # server-side secrets for Pages Functions (never commit)
```

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | Public |
| `VITE_SUPABASE_ANON_KEY` | `.env` | Public; safe only because RLS is enabled on every table |
| `SUPABASE_URL` | `.dev.vars` / versel | Used by the proxy |
| `SUPABASE_ANON_KEY` | `.dev.vars` / versel | Proxy calls Supabase as the user |
| `GROQ_API_KEY` | `.dev.vars` / versel | **Secret** |
| `GROQ_MODEL` | `.dev.vars` / versel | Check Groq's current free-tier model list before choosing |
| `LLM_PROVIDER` | `.dev.vars` / versel | `groq` (default); provider abstraction allows `gemini` |

Never put the service-role key or any LLM key in a `VITE_` variable.

### Database
```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push            # applies supabase/migrations/*
npx supabase gen types typescript --linked > belluna/src/lib/database.types.ts
```

Before enabling AI requests, configure the per-user daily quota in the Supabase SQL Editor as the project/database owner. Replace `<approved_positive_integer>` with the limit approved by the team; do not expose this configuration to client roles:
```sql
insert into public.ai_quota_config (id, daily_limit)
values (1, <approved_positive_integer>)
on conflict (id) do update set daily_limit = excluded.daily_limit;
```
The migration deliberately seeds no limit. The `consume_ai_quota()` RPC fails closed until a valid positive limit is configured. `service_role` has no table privileges for this setting; configure it as the database owner/admin using the SQL Editor, not through a service-role API call.

Before enabling AI requests, the server-side AI implementation must call `consume_ai_quota()` as the authenticated user and stop before calling the AI provider if it returns `false`. Treat an RPC error or missing quota configuration as a failure and do not call the provider. The current Express server exposes `/api/health-ai`, while the Translator calls `/api/explain`; no provider invocation is implemented, so this integration remains incomplete and must be coordinated with Member 1.

The migration adds `chat_messages` to Supabase's `supabase_realtime` publication only if it is not already a member. If that publication is absent, the migration stops with an instruction to enable Realtime for `chat_messages` in Supabase before rerunning the fresh-install migration.

Enable **Anonymous sign-ins** in Supabase Auth settings if the chat uses them.

### Tracker migration and symptom catalogue

`supabase/migrations/0002_unique_cycle_start_dates.sql` adds a unique index for
each user's period start date. It does not delete or rewrite records, but it
intentionally stops if duplicate starts already exist. Review and resolve any
duplicates before applying it; do not rerun `0001_init.sql`.

For a project where `0001_init.sql` was applied manually in SQL Editor, apply
only the pending `0002` migration after confirming the migration history will
not cause `0001` to run again. For a fresh project, use the project's migration
runner to apply migrations in order. Do not mix SQL Editor execution and CLI
migration history without reconciling the recorded state. After the schema
exists, `supabase/seed.sql` can insert the static bilingual symptom catalogue;
it contains no personal health data and uses `ON CONFLICT DO NOTHING`.

The tracker UI and repositories live under `belluna/src/features/tracker/`.
Local tests do not verify hosted Supabase RLS. Before demoing, test owner-only
reads and writes with two synthetic accounts against the intended project.

### Hosted tracker/RLS verification

This is a manual integration check, separate from the mocked Vitest suite:

1. Use an approved non-production Supabase project and two synthetic test
   accounts. Create distinct cycle, daily-log and symptom records as each user.
2. Through authenticated Supabase client requests (not only the UI), verify
   each user can select, insert, update and delete only their own records.
   While signed in as user A, attempt to read and modify user B's known record
   IDs and attempt an insert with user B's `user_id`; no cross-account record
   may be returned or changed.
3. Repeat requests while signed out and confirm private operations are denied.
   Record the observed results without copying access tokens or health data
   into logs or tickets. Clean up only the synthetic accounts and records.

### Run locally
```bash
cd belluna
npm run dev           # Vite frontend
npm run server        # Express API
npm test              # Vitest unit tests
npm run build         # TypeScript check and production Vite build
```
There are currently no separate `typecheck`, `lint`, or `dev:cf` scripts in
`belluna/package.json`.

### Deploy (versel Pages)
1. Connect the GitHub repo to versel Pages.
2. Build command `npm run build`, output directory `dist`.
3. Add the environment variables above in the Pages dashboard.
4. Each pull request gets a preview deployment; `main` deploys to production.

## 7. Project structure

```
.
├── README.md
├── requirements.md
├── architecture.md
├── phases.md
├── rules.md
├── supabase/
│   ├── migrations/        database schema changes
│   └── seed.sql           bilingual symptom catalogue
└── belluna/
    ├── server/            Express API
    ├── src/
    │   ├── app/            routes, layout, providers
    │   ├── features/       translator · tracker · SOS · doctors · community · auth
    │   ├── lib/            Supabase client and utilities
    │   └── i18n/           en.json · hi.json
    └── tests/              Vitest tests
```

## 8. Team and ownership

| Role | Owns | Deliverable |
|---|---|---|
| **Member 1** — AI + Healthcare Intelligence | AI proxy, translator, sources and disclaimers, medicine library, awareness content, safety tests | A working translator returning a structured, readable explanation |
| **Member 2** — Backend + Health Tracking | Supabase schema and RLS, auth, tracker, timeline and charts, shared DB interfaces | Save cycle and symptom entries and display history securely |
| **Member 3** — Frontend + Safety Experience | Layout, navigation, Period SOS UI, doctor finder, chat UI, integration, deployment, demo | A coherent, mobile-friendly app connecting every module |

Names and contact details: _add here_.

## 9. Workflow

- `main` is protected and always deployable. Work on `feat/<member>-<topic>` branches and open a PR; one teammate reviews.
- Schema changes only via migration files, reviewed by Member 2.
- Content or prompts that affect medical output are reviewed by a second person (see [`docs/rules.md`](docs/rules.md)).

## 10. Demo path (what judges will see)

1. Sign in as the **synthetic demo user** with three months of seeded cycle and symptom data.
2. Open the **timeline and charts** — the pattern is visible.
3. Ask the **translator** a question in Hindi; get a structured explanation with sources.
4. Run **Period SOS** with a red-flag answer; get a clear next step and the nearest clinics on the map.
5. (If shipped) Post, report and block in the **anonymous chat**.
6. Log a **new entry live** to prove the flow works end to end.

Only synthetic data is used in demos.

## 11. Safety and privacy

- No diagnosis, no dosing, no prescriptions. Emergencies are routed to 112, not to the AI.
- The AI never invents links: it returns source IDs that map to a curated, reviewed source list.
- Row Level Security on every table; minimal data; user-initiated data deletion.
- The AI key stays on the server. Queries are not logged by default.

## 12. Known limitations

- Free tiers (Groq, Supabase, versel, Overpass) have rate limits and can change; a Supabase free project may pause when inactive — wake it before the demo.
- OpenStreetMap coverage of clinics in India is incomplete; a curated fallback list covers the demo city.
- Rules and content are not clinically validated beyond informal review.

## 13. Credits

Map data © OpenStreetMap contributors. Health content cites WHO, NHS, MedlinePlus, MoHFW and similar public sources, listed per item.

## 14. Licence

_To be decided by the team._
