# Tdot Dashboard — Inventory + Pricing Analysis System

An internal operational platform for centralized product management, inventory tracking, purchasing, landed cost calculation, channel pricing, and profitability analysis.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend Server:** NestJS
- **Styling:** Tailwind CSS + shadcn/ui components
- **State/Data:** TanStack React Query + Supabase JS
- **Validation:** Zod + React Hook Form
- **Database/Auth:** Supabase (PostgreSQL + Row Level Security + Auth)
- **Backend Hosting:** Railway

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Set up database

Run the migration in `supabase/migrations/001_initial_schema.sql` against your Supabase project (via the SQL Editor in the Supabase Dashboard).

### 4. Start development server

```bash
npm run dev
```

### 5. Start NestJS backend server

Install the backend package once, then run it from the root workspace:

```bash
npm --prefix backend install
npm run dev:api
```

The API listens on `http://localhost:3001/api` by default.

Useful backend endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Railway health check and Supabase configuration status |
| `GET /api/me` | Verifies a Supabase bearer token and returns the authenticated user |
| `GET /api/products` | Retrieves API products with variants |
| `GET /api/product/:id` | Retrieves one API product with variants |
| `POST /api/product` | Creates an API product |
| `PATCH /api/product/:id` / `PUT /api/product/:id` | Updates an API product |
| `GET /api/variant/:id` | Retrieves one API product variant |
| `POST /api/product/:id/variant` | Creates a variant for an API product |
| `PATCH /api/variant/:id` / `PUT /api/variant/:id` | Updates an API product variant |

Product API routes require the same Supabase bearer token style as `/api/me`. They are backed by `product_api.products` and `product_api.variants`; apply `supabase/migrations/011_create_api_products_and_variants.sql` to the target Supabase project before using them.

Because these tables live outside `public`, add `product_api` to the Supabase project's exposed schemas if the REST API returns a schema/cache error for these routes.

### 6. Deploy backend to Railway

This repo includes `railway.json`, so Railway can deploy the NestJS backend from the repo root.

Set these Railway variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FRONTEND_URL=https://your-frontend-domain
```

These must be set on the Railway backend service itself. Netlify frontend variables and local `.env` values are not automatically available inside the Railway container.

In Railway, add them from **Project -> backend service -> Variables**, or use the CLI with your real values:

```bash
railway variables --set "SUPABASE_URL=https://your-project.supabase.co"
railway variables --set "SUPABASE_ANON_KEY=your-anon-key"
railway variables --set "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
railway variables --set "FRONTEND_URL=https://your-frontend-domain"
```

The repo pins Node 22 through `package.json` engines, `.nvmrc`, and `nixpacks.toml` because the deployed Supabase client path expects the Node 22 runtime on Railway.

Railway will run `cd backend && npm ci --include=dev && npm run build` and start the server with `cd backend && npm run start:prod`.

## Modules

| Module | Description |
|--------|-------------|
| Products | Product master records with SKU, UPC, dimensions |
| Inventory | Multi-location tracking, adjustments, transfers |
| Purchases | Invoice management with landed cost engine |
| Suppliers | Supplier CRUD |
| Pricing | Channel-specific pricing (retail/offer/promo) |
| Profitability | Projected margin analysis by channel |
| Settings | Warehouse locations, sales channels, users |

## Architecture

- All relationships use immutable UUIDs (never SKU/name/UPC)
- Inventory balances can never go negative
- All inventory changes generate movement history
- Purchase completion is atomic: calculates landed costs + creates inventory
- Row Level Security enforces role-based access at the database level
