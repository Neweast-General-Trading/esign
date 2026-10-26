# E-Sign — Electronic Signature Portal

A web portal for creating, circulating and electronically signing internal HR documents
(contracts, policies, acknowledgements and similar). HR prepares a document, chooses who
must sign and in which order, and each party receives a private copy with a secure e-mail
link. Completed copies can be downloaded as styled **PDF**.

> Internal product of **New East General Trading**. See [LICENSE](LICENSE).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start (local development)](#quick-start-local-development)
- [Configuration](#configuration)
- [Production deployment](#production-deployment)
- [Access control](#access-control)
- [Useful commands](#useful-commands)
- [Contributing](#contributing)

---

## Features

**Document authoring**

- Rich-text editor (TipTap) with tables, images, underlines and company branding.
- **Word import** (`.docx`) into an editable document.
- Document types (NDA, contract, policy acknowledgement, …) managed in the portal.
- Dynamic fields (text, number, date) that show **both the field name and the value** on
  screen and on the PDF.
- Signature placeholders bound to a signing **step**, not to a person index.

**Signing workflow**

- Sequential steps (for example employees then manager).
- **Private copies**: if several people sit on step 1, each employee gets their own
  document. Peers never see each other's signatures or field values. The manager then
  signs that employee's copy only.
- One-party signing is supported (a single step with a single person).
- Recipients can be picked individually, by company, by department, or all employees.
- Secure token links in e-mail (`/sign/:token`); reminders can be sent from the tracking
  panel.
- Large fan-out (more than 25 copies) sends e-mail in the background.

**Documents & printing**

- On-screen document sheet and PDF omit system metadata (document type, reference,
  prepared by, date, status). That information stays in the portal overview only.
- PDF export uses html2canvas + jsPDF with page breaks snapped to table rows and
  paragraphs so lines are not sliced.
- Signers can download or open the PDF from the sign page.

**Platform**

- Microsoft (Entra ID) sign-in, optional intranet-link login, and a gated local login.
- Employee directory from SAP HANA / SQL Server (person number, company, department).
- JWT sessions for the portal API.
- JSON file store for documents and types (`server/data/`, git-ignored).
- Office 365 SMTP via Nodemailer.

## Architecture

```
┌──────────────────────┐   HTTPS   ┌───────────┐  /api/         ┌────────────────────┐
│  Browser (React SPA) │ ────────▶ │   nginx   │ ─────────────▶ │  Express API       │
│  Vite build (static) │ ◀──────── │ + TLS     │                │  port 4038 (PM2)   │
└──────────────────────┘           └───────────┘                └─────────┬──────────┘
                                                                          │
                       ┌────────────────────────┬───────────────┬─────────┴─────────┐
                       ▼                        ▼               ▼                   ▼
                 JSON files             Microsoft Entra ID   SAP HANA / SQL Server  Office 365 SMTP
              (server/data/)            (staff sign-in)      (employee directory)   (sign links)
```

- Two public fronts share one API:
  - `https://esign.neweast.cloud` — dedicated host.
  - `https://mis.neweast.cloud/esign/` — path on the MIS dashboard.
- nginx proxies `/api/` to `127.0.0.1:4038`. The API is not exposed on the public port.
- Upload limit is **25 MB** at nginx (`client_max_body_size`) and **20 MB** on the JSON
  body parser (Word files with images).

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, TanStack Query, TipTap |
| Backend | Express, TypeScript (`tsx` in development) |
| Storage | JSON files under `server/data/` |
| Documents | TipTap HTML, mammoth (Word import), html2canvas + jsPDF |
| Auth | JWT, Microsoft Entra ID (OAuth 2) |
| Directory | SAP HANA, Microsoft SQL Server |
| Mail | Nodemailer (Office 365 SMTP) |
| Ops | PM2 (`e-sign-api`), nginx, Certbot |

## Repository layout

```
.
├── src/                    React SPA
│   ├── pages/              Dashboard, create, types, signatories, view, sign
│   ├── components/         Editor, sidebar tree, tracking, signature dialog
│   └── lib/                API client, PDF/HTML, input & signature fields
├── server/                 Express API
│   ├── src/                Auth, documents, mailer, employees, Oracle-adjacent stores
│   └── .env.example        All supported environment variables
├── nginx/                  Site for esign.neweast.cloud and MIS /esign/ include
├── public/                 Logos
├── deploy.sh               Build, rsync static files, nginx, PM2 restart
└── package.json            Web UI scripts (`dev`, `build`, `build:mis`)
```

## Quick start (local development)

### Prerequisites

- **Node.js ≥ 20** and npm ≥ 10
- *Optional:* SAP HANA / SQL Server credentials for the live employee list
- *Optional:* Azure app registration for Microsoft sign-in

### 1. Clone and install

```bash
git clone https://github.com/Neweast-General-Trading/esign.git
cd esign
npm install
cd server && npm install && cd ..
```

### 2. Configure the API

```bash
cp server/.env.example server/.env
```

Minimum local values:

```dotenv
PORT=4038
APP_JWT_SECRET=any-long-random-string
CLIENT_URL=http://localhost:5182
ALLOW_DEV_LOGIN=true
OPEN_LOGIN=true
MAIL_ENABLED=false
```

When `MAIL_ENABLED=false`, sign links are printed in the API console instead of being
sent.

### 3. Run the API and the web UI

```bash
# terminal 1 — API on http://localhost:4038
npm run dev:server

# terminal 2 — web UI on http://localhost:5182
npm run dev
```

Open and sign in. With `ALLOW_DEV_LOGIN=true` the development login is available.

## Configuration

All backend settings are environment variables documented in
[`server/.env.example`](server/.env.example). The most important ones:

| Variable | Purpose |
|----------|---------|
| `PORT` | API listen port (production: **4038**) |
| `APP_JWT_SECRET` | Session signing (**required in production**) |
| `CLIENT_URL` | Public origin used in e-mail links (`https://esign.neweast.cloud`) |
| `ALLOW_DEV_LOGIN`, `OPEN_LOGIN` | Local / open login gates — keep off in production |
| `SMTP_*`, `MAIL_FROM`, `MAIL_ENABLED`, `MAIL_BCC` | Office 365 outbound mail |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI` | Microsoft sign-in |
| `SERVER_NODE`, `SAP_HANA_*`, `SQL_DB_*` | Employee directory |

The web UI talks to `/api` on the same host (nginx or the Vite proxy).

## Production deployment

```bash
# Build API + both static fronts, copy to nginx roots, reload nginx, restart PM2
bash deploy.sh
```

What `deploy.sh` does:

1. `npm run build` in `server/` (TypeScript → `server/dist`).
2. `npm run build` — SPA for `https://esign.neweast.cloud` → `/var/www/esign.neweast.cloud`.
3. `npm run build:mis` — SPA with base `/esign/` → `/var/www/mis-dashboard/esign`.
4. Installs `nginx/esign.neweast.cloud.conf` and includes `nginx/esign-mis.conf` on MIS.
5. Restarts PM2 process **`e-sign-api`**.
6. Attempts Certbot for `esign.neweast.cloud` when DNS is present.

**Production checklist**

- Strong `APP_JWT_SECRET`; `ALLOW_DEV_LOGIN=false` and `OPEN_LOGIN=false`.
- `MAIL_ENABLED=true` and a working Office 365 mailbox.
- TLS on nginx; `client_max_body_size 25m`.
- Do not point `deploy.sh` at a Certbot-managed site in a way that overwrites live SSL
  without review — the live file is `/etc/nginx/sites-enabled/esign.neweast.cloud`.
- `server/data/` holds live documents and must be backed up; it is git-ignored.

**Live URLs**

- https://esign.neweast.cloud
- https://mis.neweast.cloud/esign/

## Access control

- Portal users authenticate with **Microsoft Entra ID** (staff accounts).
- Signing recipients do **not** need a portal account; they use a one-time token URL.
- Employee pickers follow company / department from the HANA / SQL directory.
- Runtime documents live only on the server JSON store, not in git.

## Useful commands

| Command | Description |
|---------|-------------|
| `npm install` / `cd server && npm install` | Install web UI / API dependencies |
| `npm run dev` | Vite UI on port **5182** |
| `npm run dev:server` | Express API in watch mode |
| `npm run build` | Production SPA for the dedicated domain |
| `npm run build:mis` | Production SPA for MIS `/esign/` |
| `cd server && npm run build` | Compile the API |
| `bash deploy.sh` | Full production deploy on the host |

## Contributing

1. Create a feature branch from `main`.
2. Run `npm run build` (web) and `cd server && npm run build` before opening a pull request.
3. Never commit secrets, `.env` files, `server/data/`, logs or certificates.
4. Keep user-facing text in English.
5. Git commits on this repository are authored as **jad.sakour** only.

See [CONTRIBUTING.md](CONTRIBUTING.md).
