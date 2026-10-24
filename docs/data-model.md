# Data Model & Schema Invariants

> **System**: Expense Management App  
> **Status**: Authoritative Schema Specification  
> **Reference**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) & [docs/architecture.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/architecture.md)

---

## 1. Entity Relationship Diagram (Conceptual)

```text
       ┌──────────────┐
       │     User     │ (Supabase Auth)
       └──────┬───────┘
              │ 1:N
   ┌──────────┴──────────┬─────────────────────┐
   │                     │                     │
┌──▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
│ Account │       │  Category   │       │ Transaction │
└──┬──────┘       └──────┬──────┘       └──┬─────┬────┘
   │                     │                 │     │
   │ 1:N                 │ 1:N             │     │
   └──────────────┬──────┴─────────────────┘     │
                  │ (Foreign Keys)               │
                  ▼                              ▼
      ┌───────────────────────────┐      ┌───────────────┐
      │  offline_mutation_queue   │      │ Settings (1:1)│
      └───────────────────────────┘      └───────────────┘
```

---

## 2. Table Specifications

### A. `accounts`
| Field | Type | Description |
|---|---|---|
| `id` | UUID v4 (PK) | Globally unique identifier |
| `user_id` | UUID (Nullable) | Remote Supabase user ID (`null` in Guest Mode) |
| `name` | String | User-facing account name (e.g., "Cash", "Personal Bank") |
| `type` | Enum | `'cash'` \| `'bank'` \| `'credit_card'` \| `'digital_wallet'` \| `'custom'` |
| `initial_balance` | Integer | Starting balance in minor units (e.g. cents) |
| `current_balance` | Integer | Derived cached balance in minor units (performance cache) |
| `currency` | String(3) | ISO 4217 currency code (e.g. `'SAR'`, `'USD'`, `'EGP'`) |
| `is_archived` | Boolean | If `true`, hidden from default transaction pickers |
| `created_at` | Timestamp | ISO 8601 UTC creation time |
| `updated_at` | Timestamp | ISO 8601 UTC update time |
| `deleted_at` | Timestamp | Nullable soft-delete timestamp |
| `sync_version` | Integer | Monotonic counter for concurrency control |

### B. `categories`
| Field | Type | Description |
|---|---|---|
| `id` | UUID v4 (PK) | Globally unique identifier |
| `user_id` | UUID (Nullable) | Remote Supabase user ID |
| `slug` | String (Nullable) | Fixed system key for default categories (e.g. `'cat_food'`) |
| `name` | String | Category display name (e.g. "طعام ومطاعم") |
| `type` | Enum | `'expense'` \| `'income'` |
| `icon` | String | Icon identifier string (from Lucide/Phosphor) |
| `color` | String | Hex color string (e.g. `'#F97316'`) |
| `is_default` | Boolean | `true` if pre-seeded system category; `false` if user custom |
| `created_at` | Timestamp | ISO 8601 UTC |
| `updated_at` | Timestamp | ISO 8601 UTC |
| `deleted_at` | Timestamp | Nullable soft-delete timestamp |
| `sync_version` | Integer | Monotonic counter |

### C. `transactions`
| Field | Type | Description |
|---|---|---|
| `id` | UUID v4 (PK) | Globally unique identifier |
| `user_id` | UUID (Nullable) | Remote Supabase user ID |
| `type` | Enum | `'expense'` \| `'income'` \| `'transfer'` |
| `amount` | Integer | Positive monetary amount in minor units (strictly > 0) |
| `date` | Date | Transaction date (`YYYY-MM-DD`) |
| `category_id` | UUID (Nullable) | FK to `categories` (mandatory for expense/income; null for transfers) |
| `account_id` | UUID (FK) | Source account for expense/transfer; Destination account for income |
| `destination_account_id` | UUID (Nullable) | Destination account for transfers (null for expense/income) |
| `payment_method` | String (Nullable) | Optional payment instrument (defaults to account type) |
| `notes` | Text (Nullable) | Optional remarks or payee name |
| `tags` | Array of Strings | Optional list of string tags |
| `created_at` | Timestamp | ISO 8601 UTC |
| `updated_at` | Timestamp | ISO 8601 UTC |
| `deleted_at` | Timestamp | Nullable soft-delete timestamp |
| `sync_version` | Integer | Monotonic counter |

### D. `offline_mutation_queue`
| Field | Type | Description |
|---|---|---|
| `id` | UUID v4 (PK) | Mutation record ID |
| `entity_type` | Enum | `'account'` \| `'category'` \| `'transaction'` |
| `entity_id` | UUID v4 | Target entity ID |
| `action` | Enum | `'UPSERT'` \| `'DELETE'` |
| `client_base_version` | Integer | Base version known to client when action was queued |
| `payload` | JSON | Serialized entity snapshot |
| `client_timestamp` | Timestamp | Local ISO 8601 UTC |
| `retry_count` | Integer | Number of failed sync attempts |
| `status` | Enum | `'pending'` \| `'syncing'` \| `'failed'` |

### E. `conflict_audit_log`
| Field | Type | Description |
|---|---|---|
| `id` | UUID v4 (PK) | Audit entry ID |
| `entity_type` | String | Target entity table |
| `entity_id` | UUID v4 | Target entity ID |
| `client_payload` | JSON | Overwritten local change |
| `server_payload` | JSON | Server canonical version |
| `resolved_at` | Timestamp | Resolution timestamp |
| `resolution_note` | String | Explanation of conflict resolution |

---

## 3. Schema Invariants & Integrity Constraints

1. **Amount Invariant**:
   - `transaction.amount` MUST be a strictly positive integer (`amount > 0`). Zero or negative transaction amounts are rejected at the schema level.

2. **Transfer Invariant**:
   - For any transaction of `type = 'transfer'`, `destination_account_id` MUST NOT be null, and `account_id != destination_account_id`.

3. **Ledger Balance Invariant**:
   - An account's true balance is strictly defined by:
     $$\text{Balance}(A) = \text{initial\_balance} + \sum_{\substack{\text{Income}\\ \text{to } A}} \text{amount} - \sum_{\substack{\text{Expense}\\ \text{from } A}} \text{amount} + \sum_{\substack{\text{Transfer}\\ \text{to } A}} \text{amount} - \sum_{\substack{\text{Transfer}\\ \text{from } A}} \text{amount}$$
   - Any transaction with `deleted_at IS NOT NULL` is excluded from the summation.

4. **Category Reassignment Invariant**:
   - A category cannot be deleted if active non-deleted transactions reference it, unless transactions are reassigned to another valid category.

5. **Currency Immutability Invariant**:
   - Base currency can be selected on initialization. Once transactions or non-zero balances exist, changing base currency is locked in MVP.
