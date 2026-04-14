# 🛒 Multi-Channel Inventory Sync (Mercado Libre + Tiendanube)

Real-time stock synchronization platform designed to eliminate overselling and unify inventory across multiple marketplaces.

## Problem
Inventory was managed independently in Mercado Libre and Tiendanube, causing delays in updates and frequent overselling. This impacted fulfillment reliability, customer experience, and operational efficiency.

## Solution
I built a centralized stock system that synchronizes inventory in real time across both platforms using webhooks, idempotent processing, and a single source of truth.

## Technologies
- React (Vite)
- Node.js / Express
- PostgreSQL (Supabase)
- Mercado Libre API
- Tiendanube API

## Key Features
- Centralized stock management across multiple marketplaces
- Real-time synchronization via webhooks
- Idempotency system to prevent duplicate stock updates
- Automated stock propagation after every change
- Stock tracking and auditability
- Secure internal endpoints for operations

## Impact
- Eliminated overselling (**reduced to 0**)
- Improved operational reliability and fulfillment accuracy
- Reduced manual intervention and support workload
- Enabled scalable multi-channel inventory management

## Status
Production-ready solution used in a real business environment.

## My Role
Full ownership of the project:
- System architecture and design
- API integrations (Mercado Libre & Tiendanube)
- Stock synchronization logic and idempotency strategy
- Database modeling and operational workflows

## Demo
No public demo available (private business integration).

## Installation
```bash
# Backend
npm install
cp .env.example .env
npm run dev

# Frontend
cd frontend
npm install
npm run dev
