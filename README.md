# Suros Logic Web

Suros Logic Web is a production React + Firebase application for contractors to generate, manage, and reuse professional bid documents.

It includes:
- A marketing/public site with Stripe checkout.
- An authenticated dashboard and bid workflow.
- A Plan Analyzer for PDF/image plan files, including hybrid text + vision analysis.
- Firebase-backed profile + bid storage.
- Firebase Cloud Functions for Stripe billing, AI estimate generation, and plan analysis.

---

## Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- React Router
- Firebase Web SDK (Auth, Firestore, Storage)
- Tailwind CSS + Radix UI + shadcn/ui components

### Backend (Firebase Functions)
- Node.js 20
- Firebase Functions v2 + Firebase Admin
- Stripe API (subscriptions + billing portal + webhooks)
- OpenAI API (estimate generation, plan analysis, scope extraction)
- pdf-lib (temporary sampled PDFs for large plan analysis)
- Resend (password setup and reset emails)

---

## Monorepo Structure

```text
.
├── src/                    # Frontend app
├── public/                 # Static assets
├── functions/              # Firebase Cloud Functions backend
├── firebase.json           # Hosting/functions config
├── package.json            # Frontend scripts + deps
└── functions/package.json  # Functions scripts + deps
```

---

## Core Product Flows

- **Landing page** (`/`) with marketing content and Stripe checkout CTA.
- **Authentication** (`/auth`) via Firebase Auth.
- **Protected dashboard** (`/dashboard`) for bid operations.
- **Bid form** (`/form/bid_form`) with line items, pricing math, and submission webhook.
- **Bid history + saved bids** (`/view-bids`, `/bids/history`) backed by Firestore.
- **Plan Analyzer** (`/plan-analyzer`) for uploaded plan PDFs/images, overview generation, scopes, verification checklists, safety notes, conflicts, and RFIs.
- **Billing management** (`/billing`) via Stripe customer portal.
- **Legal pages** (`/privacy`, `/terms`).

---

## Plan Analyzer PDF Processing

Uploaded PDFs are analyzed with a hybrid pipeline so scanned/image-based plans and normal text PDFs can both produce useful plan context.

- Local text extraction runs first for every PDF page.
- OpenAI vision analysis is required for PDF analysis and is used alongside extracted text.
- Weak, mixed, scanned, or smaller PDFs use `pdf_hybrid_full`, which sends the full PDF to vision.
- Large text-rich PDFs use `pdf_hybrid_sampled`, which creates a temporary PDF containing up to 15 selected pages, sends only that sampled PDF to vision, then maps the visual summaries back to the original page numbers.
- All pages keep their extracted text. In sampled mode, selected pages also get visual analysis.
- Image uploads use image OCR/visual fallback behavior instead of PDF sampling.

Sampling is designed to reduce cost and latency without ignoring important visual context. The sampled pages include key boundary pages, pages with weak extracted text, and a spread across the rest of the document.

The analysis method is saved on plan file records as `analysisMethod`, for example `pdf_hybrid_full`, `pdf_hybrid_sampled`, `image_ocr`, or `image_visual_fallback`. Existing Firestore records without this optional field still work.

Useful backend logs:

```text
[analyzePlanFiles] Extraction method ... method=pdf_hybrid_full|pdf_hybrid_sampled ...
[analyzePlanFilesHybrid] Token totals ...
```

If vision analysis fails, PDF analysis fails with an error like:

```text
Vision analysis failed for <file name>: <provider error>
```

That error is stored in Firestore under the plan project error fields and is surfaced in the frontend's Plan Analyzer run UI.

---

## Local Development

## 1) Prerequisites

- Node.js 20+
- npm
- Firebase CLI (`npm i -g firebase-tools`)

## 2) Install dependencies

From repo root:

```bash
npm install
```

Install Cloud Functions dependencies:

```bash
cd functions
npm install
cd ..
```

## 3) Configure environment variables

Create a local env file:

```bash
cp .env.example .env.local
```

> If `.env.example` does not exist yet, create `.env.local` manually.

Frontend variables used by the app:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FUNCTIONS_BASE_URL=
VITE_DEV_ACCESS_ALLOWED_EMAILS=
VITE_DEV_ACCESS_HOSTS=
```

`VITE_FUNCTIONS_BASE_URL` is optional and only needed when overriding the
default Functions URL derived from `VITE_FIREBASE_PROJECT_ID`.

`VITE_DEV_ACCESS_HOSTS` is the list of hostnames where the dev gate should run.
For local and hosted dev testing, use a comma-separated list like
`localhost,127.0.0.1,dev.suroslogic.com,suros-logic-dev.web.app,suros-logic-dev.firebaseapp.com`.
`VITE_DEV_ACCESS_ALLOWED_EMAILS` is the dev tester allowlist; use a
comma-separated list like `owner@example.com,tester@example.com`.

Backend routes read runtime secrets from Firebase Secret Manager. Create the same
secret names in both Firebase projects, with dev/test values in `suros-logic-dev`
and production values in `suros-logic`:

```bash
# Firebase Secret Manager names for both prod and dev projects
OPENAI_API_KEY=
API2PDF_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_MONTHLY_150=
RESEND_API_KEY=

# Optional local emulator override
APP_BASE_URL=
```

`functions/.env` is optional and can be empty when these values are managed in
Firebase Secret Manager.

## 4) Run frontend

```bash
npm run dev
```

Default Vite URL: `http://localhost:5173`

## 5) Run Cloud Functions emulator (optional but recommended for backend work)

In a separate terminal:

```bash
cd functions
npm run serve
OR
firebase emulators:start --only functions --project dev
```

## 5.1) Run Stripe webhook for testing (optional but recommended for backend work)

In a separate terminal:

```bash
stripe listen --forward-to localhost:5001/suros-logic-dev/us-central1/stripe/events
```

---

## Available Scripts

### Frontend (`/package.json`)

- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run build:dev` — development-mode build
- `npm run lint` — run ESLint
- `npm run preview` — preview built app

### Functions (`/functions/package.json`)

- `npm run serve` — run Firebase emulators for functions using the dev project
- `npm run deploy` — deploy functions
- `npm run logs` — view functions logs

---

## Deployment

The repo is configured for Firebase Hosting + Functions.

- Hosting serves `dist/` and rewrites all SPA routes to `index.html`.
- `generateEstimate` is exposed as a function rewrite route.
- Stripe endpoints are served from the `stripe` function.

Deploy to development:

```bash
npm run build:dev
firebase deploy --project dev
```

Deploy to production:

```bash
npm run build
firebase deploy --project prod
```

---

## Notes for Maintainers

- Subscription gating is enforced in the dashboard based on Firestore user profile flags (`isSubscribed`, `stripeCustomerId`).
- Bid form submissions currently post to an external n8n webhook for document generation workflow.
- Firestore data models live under `src/models`.
- Auth + user profile bootstrapping logic lives in `src/context/AuthContext.tsx`.
- Plan Analyzer high-accuracy routes currently use literal `gpt-5.2` model values for vision, overview, and scope generation instead of environment-variable model overrides.

---

## License

Private/internal project unless explicitly licensed otherwise by repository owner.
