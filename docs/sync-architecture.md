# Synchronization Architecture & Concurrency Control

> **System**: Expense Management App  
> **Status**: Authoritative Technical Specification  
> **Reference**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) & [DECISIONS.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/DECISIONS.md)

---

## 1. Local-First Engine & Topology
The application is strictly **Local-First**:
- **Primary Runtime Store**: Client-side IndexedDB (via Dexie.js).
- **Secondary Cloud Store**: Remote Supabase PostgreSQL database.
- Every user action (create, edit, soft-delete) completes in `<50ms` against local IndexedDB without waiting for network I/O.
- Cloud synchronization is an asynchronous, background reconciliation process that never blocks UI responsiveness.

```text
User Action ──▶ Write to IndexedDB ──▶ Update Cached Balances ──▶ Append to Mutation Queue
                                                                          │
                                                                   (When Online)
                                                                          ▼
                                                              Push to Supabase (OCC Check)
                                                                          │
                                            ┌─────────────────────────────┴─────────────────────────────┐
                                            ▼                                                           ▼
                             [No Conflict: Version Match]                                  [Conflict: Version Mismatch]
                             - Server increments sync_version                               - Server retains canonical version
                             - Mutation removed from queue                                  - Client copy archived to conflict_audit_log
                             - Entity state marked "synced"                                 - User alerted with Sync Warning
```

---

## 2. UUID & Key Generation Strategy
- All entities (`accounts`, `categories`, `transactions`) generate a client-side **UUID v4** at creation time.
- Entity IDs are globally unique, immutable, and generated offline.
- Client-side UUID generation guarantees that records created offline can be cross-referenced immediately (e.g. creating an account and immediately recording an expense within it) without waiting for server-assigned primary keys.

---

## 3. Offline Mutation Queue
- When any local entity mutation occurs (Insert, Update, Delete), a corresponding record is written atomically inside the same IndexedDB transaction to `offline_mutation_queue`:
  ```text
  OfflineMutation {
    id: UUID v4 (Primary Key)
    entity_type: 'account' | 'category' | 'transaction'
    entity_id: UUID v4
    action: 'UPSERT' | 'DELETE'
    client_base_version: Integer (the sync_version known to client at mutation time)
    payload: JSON (complete serialized snapshot of entity)
    client_timestamp: ISO 8601 UTC
    retry_count: Integer (defaults to 0)
    status: 'pending' | 'syncing' | 'failed'
  }
  ```
- Mutations are dispatched in strict FIFO sequence per entity.

---

## 4. Optimistic Concurrency Control (OCC) & Server Revisions
1. **Revision Tracking**:
   - Every database table (`accounts`, `categories`, `transactions`) maintains:
     - `sync_version`: Monotonic integer counter.
     - `updated_at`: Timestamp updated by database trigger on modification.
2. **Server Verification**:
   - Pushes execute through a Supabase RPC or conditioned write:
     ```sql
     UPDATE transactions
     SET amount = mutation.payload.amount,
         category_id = mutation.payload.category_id,
         account_id = mutation.payload.account_id,
         notes = mutation.payload.notes,
         tags = mutation.payload.tags,
         deleted_at = mutation.payload.deleted_at,
         updated_at = NOW(),
         sync_version = sync_version + 1
     WHERE id = mutation.entity_id AND sync_version = mutation.client_base_version;
     ```
3. **Conflict Resolution Policy**:
   - **Version Match**: The update is committed. The server returns the new `sync_version`. The client updates its local entity `sync_version` and purges the mutation from the queue.
   - **Version Mismatch (Conflict Detected)**:
     - Another device updated this record in the interim.
     - The server version is retained as canonical to protect relational consistency.
     - The client's local conflicting change is **never silently dropped**. It is copied to a local `conflict_audit_log` table in IndexedDB with a timestamp and resolution note.
     - The remote canonical entity is pulled into IndexedDB.
     - A non-intrusive **Sync Warning** alerts the user: *"Sync conflict resolved: [Record] was updated on another device. Your local edit has been preserved in your conflict audit log."*

---

## 5. Idempotent Mutation Replay
- Every mutation carries its unique mutation `id`.
- If a network interruption occurs after the server processes a write but before the client receives the HTTP 200 response, re-submitting the mutation is recognized by Supabase (via idempotent upsert / mutation tracking) and returns success without reapplying balance changes.

---

## 6. Pull & Push Lifecycle
1. **Push Phase**:
   - Client queries `offline_mutation_queue` where `status IN ('pending', 'failed')`.
   - Sends batch payload to Supabase.
   - On success: marks mutations completed and removes from queue.
   - On network error: marks `status = 'failed'`, increments `retry_count`, and schedules exponential backoff retry.
2. **Pull Phase**:
   - Client queries Supabase for changes where `updated_at > last_sync_timestamp`.
   - Incoming records are applied to local IndexedDB.
   - Client updates `last_sync_timestamp = server_time`.
3. **Definition of Synced**:
   - Status is `Synced` if and only if `pending_mutations_count == 0` and remote updates are pulled.

---

## 7. Soft Deletion (`deleted_at`)
- Hard deletion (`DELETE FROM table`) is forbidden in the sync engine.
- Deletions are executed by setting `deleted_at = NOW()` (ISO UTC timestamp).
- Soft-delete flags propagate across devices as standard update mutations.
- Local queries filter using `where('deleted_at').equals(null)`.

---

## 8. Initial Data Merge (First-Time Login)
When a user operating in local Guest Mode signs in or registers via Supabase Auth:
1. **Preserve All Local Data**: All local transactions, accounts, and categories are preserved.
2. **Deterministic Default Category Deduplication**:
   - Default categories are matched by their system `slug` (e.g. `cat_food`).
   - If the cloud account already has `cat_food`, local transactions referencing the guest category UUID are updated to point to the cloud category's UUID.
   - Prevents duplicate default categories.
3. **Account Independence**:
   - Accounts are never merged by name or type alone. Local accounts are maintained as distinct entities to prevent accidental balance contamination.
4. **Queue Dispatch**:
   - All merged local records are assigned `user_id = auth.uid()` and queued for upload.

---

## 9. Fail-Safe Sign-Out Protocol
- **Inspection**: When the user requests Sign Out, the system checks `offline_mutation_queue`.
- **Un-synced Mutations Exist (`pending > 0`)**:
  - Sign-out is **blocked**.
  - A modal dialog appears:
    > *"You have [N] un-synced changes on this device. Signing out now will permanently clear them from this browser. Please reconnect to sync, or export a local JSON backup before signing out."*
  - Actions: [Sync Now] / [Download JSON Backup] / [Cancel].
- **Clean State (`pending == 0`)**:
  - A separate confirmation explains that this account's local cache will be removed.
  - Cloud authentication signs out, then a Dexie transaction rechecks the queue and removes records owned by the signed-out `user_id`, related queue and conflict entries, and the last cloud sync timestamp.
  - Guest records and unrelated local settings remain intact in Guest Mode.
