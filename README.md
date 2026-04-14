# marketplace-stock-sync

> **Suggested repository rename:** `marketplace-stock-sync` (current: `IntegradorML`).

Real-time stock synchronization service between Mercado Libre and Tiendanube to prevent overselling, built for commerce operations teams that manage inventory across multiple sales channels.

## Problem
When Mercado Libre and Tiendanube inventory were managed independently, stock updates arrived at different times and created overselling risk. This operational gap impacted fulfillment reliability, customer trust, and support workload.

## Solution
This project implements a centralized stock engine with webhook-driven updates, idempotent processing, and bidirectional propagation to both marketplaces. A single source of truth in PostgreSQL ensures consistent availability across channels.

## Technologies
- **Frontend:** React (Vite)
- **Backend:** Express.js (Node.js)
- **Data layer:** PostgreSQL (via Supabase)
- **Integrations:** Mercado Libre API, Tiendanube API
- **Automation:** Scheduled synchronization jobs + webhook processing

## Key Features
- Unified SKU catalog with a master stock value
- Webhook endpoints for Mercado Libre and Tiendanube events
- Idempotency guard to avoid duplicate stock movements
- Automated stock propagation to both marketplaces after each change
- Stock ledger for auditability and traceability of every adjustment
- Auth-protected operational endpoints for internal usage

## Impact
- **Overselling reduced to 0** after synchronization rollout
- Faster and safer multi-channel inventory operations
- Improved confidence for sales and fulfillment teams through consistent stock visibility

## Status
**Production-like real implementation** used to solve a live business problem.

### My Role
I owned the full implementation end-to-end:
- System design and architecture decisions
- API integrations (Mercado Libre + Tiendanube)
- Stock synchronization logic and idempotency strategy
- Database modeling and operational endpoints

## Demo
No public demo available (private business integration).

## Installation
Use this section only if you want to run the project locally for technical review.

```bash
# Backend
npm install
cp .env.example .env
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

---

## GitHub Repository Description (1 line)
Real-time Mercado Libre + Tiendanube inventory sync platform that eliminated overselling through webhook-driven, idempotent stock orchestration.
