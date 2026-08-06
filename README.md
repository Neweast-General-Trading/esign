# E-Sign

NEWEAST electronic document signature portal for HR — inspired by Policy Creator.

## Workflow

1. HR creates a document (NDA, contract, etc.) and reviews it
2. HR approves → electronic signature is generated from HR name
3. HR selects employee recipients and sends
4. Employee receives email with secure e-sign link
5. Employee confirms → signature generated from their name
6. When all parties have signed, both sides receive the signed copy by email

## Stack

- React + Vite + Tailwind (same design language as Policy Creator)
- Express API + JSON store
- Nodemailer (Office365 SMTP)

## Production URL

**https://mis.neweast.cloud/esign/**

- API (internal only): port **4038** — reserved for `e-sign-api` (PM2)
- Public access is via nginx on MIS (HTTPS 443), not the raw port

## Run locally

```bash
# API
cd server && npm install && npm run dev

# UI (another terminal)
cd .. && npm install && npm run dev
```

Deploy:

```bash
bash deploy.sh
```

## Email

Set in `server/.env`:

```
MAIL_ENABLED=true
SMTP_PASS=your-smtp-password
```

When `MAIL_ENABLED=false`, emails are logged to the API console (dry-run), and the sign link still works.
