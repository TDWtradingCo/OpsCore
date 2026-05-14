# Tdot Dashboard — Inventory + Pricing Analysis System

An internal operational platform for centralized product management, inventory tracking, purchasing, landed cost calculation, channel pricing, and profitability analysis.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui components
- **State/Data:** TanStack React Query + Supabase JS
- **Validation:** Zod + React Hook Form
- **Backend:** Supabase (PostgreSQL + Row Level Security + Auth)

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
```

### 3. Set up database

Run the migration in `supabase/migrations/001_initial_schema.sql` against your Supabase project (via the SQL Editor in the Supabase Dashboard).

### 4. Start development server

```bash
npm run dev
```

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
