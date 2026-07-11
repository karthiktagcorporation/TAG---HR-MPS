# TAG - MPS

**Manpower Plan vs Actual System — TAG Corporation**

A centralized, enterprise-grade HR manpower monitoring platform that tracks the monthly **manpower plan**, **daily actual attendance**, vendor / unit / cost-center deployment, and the resulting **shortage / excess variance** — with management dashboards, approvals, reports, exports, notifications and full audit logging.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Folder Structure](#folder-structure)
6. [Database Design](#database-design)
7. [Roles & Access](#roles--access)
8. [Local Development Setup](#local-development-setup)
9. [Environment Variables](#environment-variables)
10. [Migrations & Seeding](#migrations--seeding)
11. [Build & Run](#build--run)
12. [Deploying to Hostinger VPS (Ubuntu 24.04 with Dokploy)](#deploying-to-hostinger-vps-ubuntu-2404-with-dokploy)
13. [Sample Credentials Strategy](#sample-credentials-strategy)
14. [Troubleshooting](#troubleshooting)
15. [Assumptions](#assumptions)

---

## Overview

TAG - MPS lets HR teams enter a monthly manpower plan per **Unit → Cost Center → Vendor → Type**, route it through an **approval workflow**, then capture **daily actual** headcount. The system automatically computes:

```
shortage = max(plannedCount - actualCount, 0)
excess   = max(actualCount - plannedCount, 0)
```

against the relevant **approved** monthly plan, and surfaces everything through an executive dashboard, eleven report types, and downloadable exports (Excel / CSV / PDF / Print).

## Features

- **Authentication** — username **or** email login, JWT access token + rotating refresh token, bcrypt hashing, rate-limited auth endpoints.
- **RBAC** — four roles, permission-aware menus and route guards, **cost-center-scoped** access for the User Master role (enforced in both backend and frontend).
- **Dashboard** — animated KPI cards + 9 chart families (Plan vs Actual, unit/cost-center analysis, vendor performance, gender/type split, monthly & daily trends, shortage heatmap, vendor allocation), all from live DB aggregates with month/year/unit/cost-center/vendor filters.
- **Masters** — Vendors, Units, Cost Centers — all DB-backed CRUD with soft delete and active/inactive status. No master data is hard-coded in the UI.
- **Manpower Plan** — create/edit/submit, approve/reject with remarks, status history, duplicate-from-previous-month, bulk create API, unique-key conflict protection.
- **Daily Actual** — auto-variance, upsert by unique key, cost-center-restricted entry for User Master.
- **Variance Analysis** — focused plan-vs-actual shortage/excess view.
- **Reports** — 11 filterable/searchable/paginated reports with client Excel/CSV/PDF/Print **and** server-side branded XLSX export.
- **Notifications** — DB-backed, user- or role-targeted, unread state, topbar dropdown, alert generation logic (pending approvals, critical shortage).
- **Audit Logs** — every critical action (login/logout, CRUD, approvals, imports, exports, settings) with actor/IP/user-agent; Super-Admin viewer with filters.
- **Settings** — company profile, logo path, alert thresholds, report defaults, theme, financial year.
- **UI/UX** — dark blue / white / light gray / orange brand, dark & light mode, collapsible sidebar, sticky header, Framer-Motion transitions, skeleton/empty/error states, toast notifications, responsive down to mobile.

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn-style UI, React Router, TanStack Query, TanStack Table, React Hook Form, Zod, Recharts, Framer Motion, Axios, xlsx, jsPDF |
| Backend  | Node.js, TypeScript, Express, Prisma ORM, Zod, JWT, bcryptjs, Helmet, CORS, express-rate-limit, Pino, ExcelJS |
| Database | PostgreSQL 16 |
| Deploy   | Docker, docker-compose, Dokploy on Hostinger VPS (Ubuntu 24.04), Nginx (frontend) |

## Architecture

**Backend** follows a modular **route → controller → service → Prisma** layering with shared middleware (auth, RBAC, validation, error handling, rate limiting) and utilities (JWT, password, audit, logger, API response).

```
HTTP → middleware (auth, rbac, validate) → controller/route handler → service → Prisma → PostgreSQL
                                                              ↘ audit helper, notification service
```

**Frontend** is a feature-organized SPA: a typed Axios client with automatic refresh-token retry, React Query for server state, context providers for auth & theme, reusable `DataTable` / `FilterBar` / `CrudPage` / `ExportActions` components, and role-aware routing.

Consistent API envelope:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 1 } }
// error
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "...", "details": [ ... ] } }
```

## Folder Structure

```
tag-mps/
├── README.md
├── .env.example
├── docker-compose.yml
├── package.json                 # npm workspaces (backend, frontend)
├── backend/
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/0_init/migration.sql
│   └── src/
│       ├── server.ts  app.ts
│       ├── config/    (env, prisma)
│       ├── middleware/(auth, rbac, validate, error, rateLimit, asyncHandler)
│       ├── utils/     (jwt, password, audit, logger, errors, apiResponse, variance)
│       ├── routes/index.ts
│       └── modules/   (auth, users, roles, vendors, units,
│                       costCenters, plans, actuals, dashboard, reports,
│                       notifications, auditLogs, settings)
└── frontend/
    ├── Dockerfile  nginx.conf
    └── src/
        ├── main.tsx
        ├── components/ (ui, layout, DataTable, FilterBar, CrudPage, KpiCard, …)
        ├── context/    (AuthContext, ThemeContext)
        ├── hooks/      (useMasters)
        ├── lib/        (utils, exporters)
        ├── pages/      (Login, Dashboard, Plans, Actuals, Variance, Reports,
        │               masters/*, admin/*, Notifications, Settings)
        ├── routes/     (AppRouter, guards)
        ├── services/   (api, resources)
        └── types/
```

## Database Design

Normalized PostgreSQL schema (see [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)). Key tables: `roles`, `users`, `user_cost_centers`, `refresh_tokens`, `vendors`, `units`, `cost_centers`, `manpower_plans`, `plan_status_history`, `manpower_actuals`, `notifications`, `audit_logs`, `settings`.

**Relationship model (the important design decision):**

- **Unit (Div) 1—* CostCenter** — every cost center belongs to one unit.
- A cost code such as **HFRGN** / **HRBMD** legitimately exists under multiple units, so `CostCenter` is **uniquely keyed on `(unitId, costCode)`**, not on `costCode` alone.
- **Plans and actuals are cost-center-wise**: one plan row per `(year, month, costCenter)`, one actual row per `(date, costCenter)`. Shortage/excess is computed automatically against the approved monthly plan.

**Business unique constraints (prevent conflicting duplicates):**

- Plan: `@@unique(year, month, costCenterId)`
- Actual: `@@unique(date, costCenterId)`

Soft delete (`deletedAt`) is used on masters, plans and actuals; reporting indexes exist on date, unit, cost center and status columns.

## Roles & Access

| Role | Capabilities |
|------|--------------|
| **Super Admin** | Everything: users, roles, all masters, plans, approvals, reports, exports, settings, audit logs, notifications. |
| **HR Admin** | Create/edit plans & daily actuals, masters (create/edit), dashboard, reports, exports. |
| **Management / Viewer** | Read-only dashboard & reports; **approve / reject** plans. No destructive actions. |
| **User Master** | Update daily actuals **only for assigned cost centers**, view reports. Cost-center scope is assigned on the Create-User screen and enforced server-side. |

## Local Development Setup

**Prerequisites:** Node.js ≥ 20, npm ≥ 9, a running PostgreSQL 16 (local or Docker).

```bash
# 1. Clone
git clone https://github.com/karthiktagcorporation/TAG---HR-MPS.git
cd TAG---HR-MPS

# 2. Install all workspaces
npm install

# 3. Configure env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
#   → edit backend/.env DATABASE_URL + secrets

# 4. (Option A) Spin up Postgres only via Docker
docker compose up -d postgres

# 5. Apply schema + seed
npm run prisma:deploy        # or: npm run prisma:migrate (dev)
npm run seed

# 6. Run both apps (http://localhost:5173 + http://localhost:4000)
npm run dev
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | backend | PostgreSQL connection string (use host `postgres` in Docker, `localhost` locally). |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | backend | Long random strings — **rotate for production**. |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | backend | e.g. `15m` / `7d`. |
| `CORS_ORIGINS` | backend | Comma-separated allowed origins (the frontend URL). |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` | backend | Auth throttling window & max attempts. |
| `SUPER_ADMIN_NAME/USERNAME/EMAIL/PASSWORD` | backend | Seeded initial Super Admin (env-driven, never hard-coded). |
| `SEED_SAMPLE_DATA` | backend | `true` seeds demo plans/actuals/notifications; `false` = clean production data. |
| `VITE_API_BASE_URL` | frontend | Browser-facing API base URL, e.g. `https://api.example.com/api`. |
| `VITE_APP_NAME` | frontend | App display name. |
| `VITE_LOGO_URL` | frontend | Optional path/URL to a real TAG logo (overrides the placeholder mark). |

## Migrations & Seeding

```bash
npm run prisma:generate         # regenerate Prisma client
npm run prisma:migrate          # create/apply a dev migration (local DB required)
npm run prisma:deploy           # apply committed migrations (production / CI)
npm run seed                    # roles, super admin, vendors, units,
                                # cost centers, settings (+ sample data if enabled)
```

The committed baseline migration lives at `backend/prisma/migrations/0_init/migration.sql`, so `prisma migrate deploy` works out-of-the-box in production.

## Build & Run

```bash
npm run build                   # builds backend (tsc) + frontend (vite)
# Backend prod:  cd backend && npm start
# Frontend prod: served by Nginx from the Docker image, or `npm run preview`

# Full stack via Docker (Postgres + API + web):
cp .env.example .env            # fill secrets
docker compose up -d --build
# Frontend → http://localhost:8080 , API → http://localhost:4000/api
```

Health checks: `GET /api/health` and `GET /api/health/db`.

---

## Deploying to Hostinger VPS (Ubuntu 24.04 with Dokploy)

Dokploy is a self-hosted PaaS that deploys Docker services from a Git repo. The Hostinger Dokploy template comes preinstalled and is reached at `http://SERVER_IP:3000` for initial setup.

### 1. Prerequisites
- Hostinger VPS (Ubuntu 24.04) with the Dokploy template, or `curl -sSL https://dokploy.com/install.sh | sh`.
- A GitHub repo containing this project (`backend/` and `frontend/` are deployed as **separate** services from the same repo).
- Domain(s) you control.

### 2. Domain / DNS
- Create two A records pointing at the VPS IP, e.g. `mps.yourdomain.com` (frontend) and `api.yourdomain.com` (backend).
- Allow a few minutes for propagation. Dokploy + Traefik will issue Let's Encrypt SSL automatically once DNS resolves.

### 3. Create the Dokploy project
- Log in at `http://SERVER_IP:3000`, create a **Project** named `tag-mps`.

### 4. PostgreSQL service
- In the project: **Create → Database → PostgreSQL** (v16). Set user/password/db (e.g. `tagmps`).
- Note the **internal connection string** Dokploy shows — it is reachable by other services in the project by its service hostname.

### 5. Backend service
- **Create → Application**, source = your GitHub repo, **Build Path / context = `backend`**, Build type = **Dockerfile**.
- **Environment variables** (paste from `.env.example`, production values):
  - `DATABASE_URL` = the internal Postgres string from step 4
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (long random), `JWT_*_EXPIRES_IN`
  - `CORS_ORIGINS=https://mps.yourdomain.com`
  - `SUPER_ADMIN_*`, `SEED_SAMPLE_DATA=false`
  - `PORT=4000`
- **Port:** expose container port **4000**. Add domain `api.yourdomain.com` and enable HTTPS.
- The backend image runs `prisma migrate deploy` automatically on boot (see Dockerfile `CMD`).

### 6. Frontend service
- **Create → Application**, same repo, **context = `frontend`**, Dockerfile build.
- **Build args / env:** `VITE_API_BASE_URL=https://api.yourdomain.com/api`, `VITE_APP_NAME=TAG - MPS`.
- **Port:** expose container port **80**. Add domain `mps.yourdomain.com`, enable HTTPS.

### 7. Environment variables
- Use the Dokploy UI **Environment** tab per service. Never commit real secrets — `.env` is git-ignored.

### 8. Prisma migration & seed
- Migrations run automatically on backend deploy. To **seed** the initial Super Admin + masters, open the backend service **Terminal** in Dokploy and run once:
  ```bash
  npm run seed
  ```
  (Set `SEED_SAMPLE_DATA=false` first for a clean production dataset.)

### 9. SSL / domain
- Dokploy/Traefik provisions Let's Encrypt certificates per attached domain. Ensure ports **80/443** are open in the Hostinger firewall.

### 10. Troubleshooting checklist
- **Backend can't reach DB** → confirm `DATABASE_URL` host = the Postgres *service hostname*, both in the same project.
- **CORS errors** → `CORS_ORIGINS` must exactly match the frontend origin (scheme + host, no trailing slash).
- **401 loops** → check JWT secrets are set and identical across restarts; clear browser storage.
- **Migration failed on boot** → check backend logs; run `npx prisma migrate deploy` manually in the service terminal.
- **Blank frontend / API 404** → verify `VITE_API_BASE_URL` was set as a **build arg** (Vite inlines env at build time).
- **SSL pending** → DNS not yet propagated or 80/443 blocked.

---

## Sample Credentials Strategy

No passwords are hard-coded. The seed reads `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from the environment and creates exactly one Super Admin. Default development values are in `.env.example` (`superadmin` / `admin@tagcorporation.net` / `ChangeMe@12345`) — **change these for production** and re-run the seed.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Missing required environment variable: DATABASE_URL` | Create `backend/.env` from the example. |
| Prisma client out of date | `npm run prisma:generate`. |
| Seed says role/user exists | Seed is idempotent (upserts) — safe to re-run. |
| Frontend calls `localhost:4000` in prod | Rebuild with the correct `VITE_API_BASE_URL` build arg. |
| Postgres connection refused locally | `docker compose up -d postgres` then check the port. |

## Assumptions

- **Plans and actuals are cost-center-wise** (no vendor / gender-type dimension on entries). Vendors remain a reference master. Every plan save (grid edit or Excel import) goes to **PENDING** and requires approval by HR Admin or Super Admin.
- Each user holds **one role** (the `user_roles` requirement is satisfied by a normalized `Role` table + FK); cost-center scoping is the per-user multi-assignment via `user_cost_centers`.
- Bulk import is provided both as Excel import in the UI (Plans and Daily Actual pages, with downloadable templates) and as validated backend endpoints (`POST /api/plans/grid`, `POST /api/actuals/bulk`) with row-level error reporting.
- Attendance % on the dashboard compares the latest day's total actual against the month's approved planned total.

---

© TAG Corporation — TAG - MPS v1.0
