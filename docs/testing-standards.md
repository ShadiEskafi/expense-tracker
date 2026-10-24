# Testing Standards & Verification Patterns

> **System**: Expense Management App  
> **Reference**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) & [harness-engineering skill]

---

## 1. Testing Philosophy
- **Proof-Only Done**: No feature in `feature_list.json` transitions to `passing` without verifiable test evidence.
- **Fast Unit Tests**: Calculation logic (balances, integer conversion, ISO 4217 formatting, transfer algebra) must run in `< 50ms`.
- **Database Mocks / In-Memory IndexedDB**: Use `fake-indexeddb` or mock Dexie storage for deterministic service testing without depending on browser environments.

---

## 2. Testing Layers

### Layer 1: Financial & Math Logic Unit Tests
- Balance calculation reconciliation:
  - Initial balance + income - expense + incoming transfers - outgoing transfers.
- Precision arithmetic:
  - Conversion of decimal string (`"25.50"`) to integer minor units (`2550`).
  - Safe addition/subtraction without floating-point artifacts.
- Soft-delete balance restoration:
  - Deleting an expense restores account balance.
  - Deleting a transfer restores both accounts.

### Layer 2: Concurrency & Sync Engine Tests
- Mutation queue serialization and FIFO ordering.
- OCC version check simulation:
  - Matching version -> increments `sync_version` and returns success.
  - Version mismatch -> archives mutation to `conflict_audit_log` and pulls server record.
- Idempotency test: Re-submitting the same mutation UUID produces no duplicate records or double balance deductions.

### Layer 3: Component & Form Integration Tests
- Quick Add flow:
  - Validates amount > 0.
  - Requires category.
  - Defaults to today and last-used account.
  - Preserves entered data upon validation failure.
- Sign-out safety:
  - Blocks local cache wipe when `offline_mutation_queue` has pending items.

---

## 3. Verification Commands
- **Full Unit & Integration Suite**: `npm test`
- **Lint Check**: `npm run lint`
- **Typecheck & Production Build**: `npm run build`
- **End-to-End Environment Health**: `./init.sh` (or `pwsh ./init.ps1`)
