# Architecture & Domain Boundary Rules

> **System**: Expense Management App  
> **Status**: Frozen v1.0 Architectural Guidance  
> **Reference**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) & [design-system/](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/)

---

## 1. System Architecture Overview

The application is structured as a **Local-First Progressive Web Application**:
```text
┌────────────────────────────────────────────────────────┐
│                      UI Layer                          │
│   (React 19, RTL / Arabic-First, Lucide Icons, Recharts)│
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                 Application Services                   │
│  - TransactionService  - BalanceCalculatorService      │
│  - CategoryService     - AccountService                │
│  - ExportBackupService - SyncService                   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                 Local Storage Engine                   │
│             IndexedDB (Dexie.js / Native IDB)          │
│   - accounts           - categories                    │
│   - transactions       - offline_mutation_queue        │
│   - conflict_audit_log - settings                      │
└──────────────────────────┬─────────────────────────────┘
                           │ (Optional Background Sync)
┌──────────────────────────▼─────────────────────────────┐
│                 Cloud Backend Layer                    │
│                 Supabase (PostgreSQL 15+)              │
│   - Supabase Auth (JWT / RLS)                          │
│   - sync_mutation RPC (Optimistic Concurrency Control) │
│   - Remote Tables (accounts, categories, transactions) │
└────────────────────────────────────────────────────────┘
```

---

## 2. Inviolable Domain Boundary Rules

1. **Transaction Ledger as Single Source of Truth**:
   - `current_balance` on the `Account` table is purely a performance cache.
   - Any financial balance must be deterministically calculable via:
     $$\text{Balance}(A) = \text{initial\_balance} + \sum \text{Income}(A) - \sum \text{Expense}(A) + \sum \text{Transfers To}(A) - \sum \text{Transfers From}(A)$$
   - Soft-deleted transactions (`deleted_at IS NOT NULL`) are strictly excluded from calculations.

2. **Integer Minor Units Representation**:
   - Monetary values are stored as integers representing minor units based on currency exponent (e.g., $12.50 = 1250 cents for 2-decimal currencies like SAR, USD, EGP, EUR).
   - Floating-point calculations are forbidden on financial amounts.

3. **Single Transaction Transfer Guarantee**:
   - Internal transfers between accounts must be modeled as a single transaction entity of `type = 'transfer'` containing `account_id` (source) and `destination_account_id` (destination).
   - Splitting transfers into disconnected separate records is strictly forbidden.

4. **Optimistic Concurrency Control (OCC)**:
   - All mutations append to `offline_mutation_queue` with `client_base_version`.
   - The server verifies `server.sync_version == client_base_version`.
   - Conflicted local mutations are archived into `conflict_audit_log` and never silently discarded.

5. **Local-First Independence**:
   - All CRUD actions execute against IndexedDB synchronously from the user's perspective.
   - Network failure or offline state must never block UI interaction.

6. **Arabic RTL Layout Compliance**:
   - All user-facing UI must conform to the Arabic RTL design system documented in `design-system/`.
