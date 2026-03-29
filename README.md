# Suros Logic Web

Suros Logic Web is a production React + Firebase application for contractors to generate, manage, and reuse professional bid documents.

It includes:
- A marketing/public site with Stripe checkout.
- An authenticated dashboard and bid workflow.
- Firebase-backed profile + bid storage.
- Firebase Cloud Functions for Stripe billing + AI estimate generation.

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
- OpenAI API (estimate generation)
- SendGrid (new-user password setup email)

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
- **Billing management** (`/billing`) via Stripe customer portal.
- **Legal pages** (`/privacy`, `/terms`).

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
VITE_API_URL=
```

Functions secrets/variables used by backend routes:

```bash
# Firebase Secret Manager / function runtime secrets
OPENAI_API_KEY=
STRIPE_SECRET_KEY_LIVE=
STRIPE_WEBHOOK_SECRET_LIVE=
SENDGRID_API_KEY=

# Optional local emulator/runtime vars used by Stripe route
STRIPE_SECRET_KEY_TEST=
STRIPE_WEBHOOK_SECRET_TEST=
STRIPE_PRICE_ID_MONTHLY_TEST=
STRIPE_PRICE_ID_MONTHLY_LIVE=
```

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
firebase emulators:start --only functions
```

## 5.1) Run Stripe webhook for testing (optional but recommended for backend work)

In a separate terminal:

```bash
stripe listen --forward-to localhost:5001/suros-logic/us-central1/stripe/events
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

- `npm run serve` — run Firebase emulators for functions
- `npm run deploy` — deploy functions
- `npm run logs` — view functions logs

---

## Deployment

The repo is configured for Firebase Hosting + Functions.

- Hosting serves `dist/` and rewrites all SPA routes to `index.html`.
- `generateEstimate` is exposed as a function rewrite route.
- Stripe endpoints are served from the `stripe` function.

Typical deployment flow:

```bash
npm run build
firebase deploy
```

---

## Notes for Maintainers

- Subscription gating is enforced in the dashboard based on Firestore user profile flags (`isSubscribed`, `stripeCustomerId`).
- Bid form submissions currently post to an external n8n webhook for document generation workflow.
- Firestore data models live under `src/models`.
- Auth + user profile bootstrapping logic lives in `src/context/AuthContext.tsx`.

---

## License

Private/internal project unless explicitly licensed otherwise by repository owner.
