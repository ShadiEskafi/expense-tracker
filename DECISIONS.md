# Architectural Decision Records (ADRs)

> **Project**: Expense Management App  
> **Status**: Approved & Frozen for Implementation  
> **Purpose**: Record irreversible architectural decisions, contexts, and rejected alternatives to prevent context drift and decision reversals across agent sessions.

---

## ADR-001: Local-First Storage Architecture with IndexedDB (Dexie.js)
- **Status**: Accepted
- **Context**: Users need instantaneous expense tracking without network latency, and the app must function in offline environments (transit, underground, low connectivity).
- **Decision**: Use client-side IndexedDB as the primary database with Dexie.js for indexing, schema versioning, and transaction support.
- **Rejected Alternatives**:
  - *Cloud-First API*: Requires internet connection for basic logging; introduces network latency and offline failure points.
  - *LocalStorage*: Synchronous, blocks main thread, limited to ~5MB, lacks indexing and binary capabilities.
- **Consequences**: Fast local writes (<50ms), zero network dependencies for daily tasks. Requires client-side mutation queuing for optional cloud sync.

---

## ADR-002: ISO 4217 Integer Minor Units for Monetary Precision
- **Status**: Accepted
- **Context**: Standard floating-point arithmetic in JavaScript (`0.1 + 0.2 = 0.30000000000000004`) causes rounding errors in accounting calculations over time.
- **Decision**: Store all amounts as integers representing the currency's minor units based on ISO 4217 (e.g. cents/fils: 12.50 SAR = 1250 integer cents). Format for display via `Intl.NumberFormat`.
- **Rejected Alternatives**:
  - *Floating-point numbers (`Float64`)*: Unacceptable for financial ledgers due to precision drift.
  - *String-only storage*: Requires parsing on every computation, degrading query and calculation speed.
- **Consequences**: Exact arithmetic operations (addition, subtraction, summation) without rounding bugs. Requires conversion utilities on input and formatting on display.

---

## ADR-003: Transaction Ledger as Single Source of Truth for Account Balances
- **Status**: Accepted
- **Context**: Dual balance tracking (storing mutable balance on account + storing transactions) inevitably drifts out of sync if an operation fails midway or re-syncs.
- **Decision**: The transaction ledger (all non-deleted transactions) is the single authoritative source of truth. `current_balance` on the `Account` record is strictly a derived performance cache.
- **Rejected Alternatives**:
  - *Direct balance updates without ledger recalculation*: Causes phantom balances and inability to audit transaction histories.
- **Consequences**: Absolute auditability. Balance can always be reconciled and verified. Requires a lightweight reconciliation routine on startup and post-sync.

---

## ADR-004: Unified Single-Record Model for Internal Account Transfers
- **Status**: Accepted
- **Context**: Recording an internal transfer as two separate transactions (one withdrawal + one deposit) risks orphan records, partial syncs, and double counting.
- **Decision**: Represent every internal transfer as a single transaction of `type = 'transfer'` containing `account_id` (source) and `destination_account_id` (destination).
- **Rejected Alternatives**:
  - *Two linked records*: Complex rollback logic, potential for one side to fail or sync out of order.
- **Consequences**: Atomic balance updates (deduct source, credit destination). Zero risk of orphaned transfer legs.

---

## ADR-005: Optimistic Concurrency Control (OCC) with Conflict Archiving
- **Status**: Accepted
- **Context**: Multi-device usage (mobile + laptop) can result in conflicting edits made offline. Simple Last-Write-Wins (LWW) silently destroys user edits.
- **Decision**: Enforce OCC using monotonic `sync_version` counters and server timestamps. If a conflict occurs, keep the server's record as canonical, but archive the local conflicting edit into a local `conflict_audit_log` table in IndexedDB and notify the user with a Sync Warning.
- **Rejected Alternatives**:
  - *Blind Last-Write-Wins (LWW)*: Silently overwrites data without trace.
  - *Manual visual diff modal*: Too complex and intimidating for a lightweight personal expense app MVP.
- **Consequences**: Zero silent data loss. Clean relational integrity on the server.

---

## ADR-006: Deterministic Default Category Deduplication (System Slugs)
- **Status**: Accepted
- **Context**: When a guest user logs into Supabase for the first time, both local and cloud databases may have default categories (e.g. "Food & Dining"). Generating random UUIDs would duplicate default categories.
- **Decision**: Pre-seed standard default categories with fixed, deterministic system keys (`slug`: `cat_food`, `cat_groceries`, etc.). During initial merge, re-map local transactions to cloud categories matching the same slug.
- **Rejected Alternatives**:
  - *Random UUIDs for default categories*: Causes duplicate categories upon initial account creation.
- **Consequences**: Clean merge without category duplication. Custom user categories remain isolated by their own unique UUIDs.

---

## ADR-007: Safe Sign-Out with Un-Synced Mutation Blocking
- **Status**: Accepted
- **Context**: On shared devices (e.g. family iPad or shared laptop), signing out must clear local cloud data for privacy. However, doing so with pending offline edits would permanently destroy user data.
- **Decision**: Inspect `offline_mutation_queue` before sign-out. If any items are pending or failed, block sign-out and present an unavoidable safety dialog offering: 1. Sync Now, 2. Download JSON Backup, or 3. Cancel. Only when confirmed clean (`pending == 0`) is local cloud cache purged.
- **Rejected Alternatives**:
  - *Silent purge on sign-out*: Severe data loss risk for offline users.
  - *Keeping user data in IndexedDB indefinitely after sign-out*: Privacy risk on shared computers.
- **Consequences**: Complete financial privacy on shared computers with zero risk of un-synced data destruction.

---

## ADR-008: Atomic JSON Backup & Restore Pipeline
- **Status**: Accepted
- **Context**: Users require complete data portability and an offline-safe recovery mechanism independent of cloud servers.
- **Decision**: Provide complete JSON export and atomic restore with a 6-step pipeline (Validate schema -> Preview metadata -> Confirm -> Create automatic pre-restore safety snapshot -> Execute atomic Dexie transaction -> Update sync versions).
- **Rejected Alternatives**:
  - *CSV restore*: Lossy format (lacks schema types, UUIDs, soft-delete flags, and sync versions).
- **Consequences**: Foolproof data recovery without partial database corruption.

---

## ADR-009: Arabic-First and RTL-Native UI Design System
- **Status**: Accepted
- **Context**: The app's primary market is Arabic-speaking users. Merely flipping an English interface creates severe layout and numeral bugs.
- **Decision**: Build the UI as Arabic-first and RTL-native from the ground up, utilizing `IBM Plex Sans Arabic`, LTR container isolation for financial numbers (`tnum` tabular digits), thumb-zone bottom navigation for mobile, and right-aligned sidebar for desktop.
- **Rejected Alternatives**:
  - *English-first with i18n overlay*: Leads to unnatural Arabic phrasing, misaligned icons, and reversed numeric formulas.
- **Consequences**: Natural, ergonomic, culturally authentic user experience with zero translation clumsiness.

---

## ADR-010: Optional Authentication & First-Class Guest Mode
- **Status**: Accepted
- **Context**: Forcing users to create an account or sign in before using a financial tracking app causes severe onboarding drop-off (>60%). Users want immediate utility.
- **Decision**: Make authentication completely optional. The app launches immediately into Guest Mode with a full local IndexedDB database, pre-seeded default categories, and full offline functionality. When a user later chooses to sign in or register with Supabase, their local data is merged seamlessly into their cloud account without data loss.
- **Rejected Alternatives**:
  - *Mandatory login on first launch*: High user drop-off and impossible offline-first onboarding.
  - *Read-only guest demo*: Fails to provide real personal utility.
- **Consequences**: Instant time-to-value (<2 seconds to first transaction). Requires an idempotent initial merge routine upon subsequent authentication.

---

## ADR-011: Soft Deletes & Tombstone Propagation
- **Status**: Accepted
- **Context**: Hard-deleting rows in a local-first, multi-device environment causes deleted items to resurrect when pulling from an out-of-sync remote node, or breaks relational foreign keys.
- **Decision**: Enforce soft deletes across all primary entities (`Account`, `Category`, `Transaction`) using a nullable `deleted_at: string | null` ISO timestamp. Records with `deleted_at !== null` are filtered out of active UI views and financial balance calculations, but propagated during sync as tombstones.
- **Rejected Alternatives**:
  - *Physical hard deletes (`DELETE FROM ...`)*: Causes phantom resurrection during two-way sync, orphaned child references, and inability to audit past ledger history.
- **Consequences**: Complete sync determinism and prevention of record resurrection. Queries must consistently apply `where(deleted_at === null)` filtering.

---

## ADR-012: Design System Authority as Single Source of Truth for UI/UX
- **Status**: Accepted
- **Context**: Dispersing design decisions across ad-hoc CSS rules, component props, and conflicting specs leads to visual fragmentation, broken RTL layouts, and inconsistent user experience across sessions.
- **Decision**: Designate `design-system/` (19 comprehensive documentation and token files) as the sole, immutable source of truth for all UI, layout, typography, interaction, accessibility, and visual tokens. Code implementations must derive strictly from these tokens and components.
- **Rejected Alternatives**:
  - *Ad-hoc Tailwind styling without centralized design tokens*: Leads to arbitrary padding, conflicting color palettes, and broken RTL alignments.
  - *External Figma dependency*: Requires ongoing external API access and sync overhead.
- **Consequences**: Consistent, accessible, and high-fidelity Arabic-first interface with zero visual drift across engineering sessions.

---

## ADR-013: PWA Offline App Shell Caching and Storage Persistence API
- **Status**: Accepted
- **Context**: Users operate in diverse network environments (subways, flights, unstable mobile connections) and require reliable offline launch without blank screen crashes. Furthermore, browser IndexedDB storage can be evicted by browsers under extreme disk pressure unless explicitly granted persistent status.
- **Decision**: Implement a Progressive Web Application (PWA) architecture with a dual-layer resilience model:
  1. **Service Worker App Shell Caching**: Network-First strategy for HTML navigation requests (falling back to `/index.html` for offline SPA routing), Stale-While-Revalidate strategy for static application assets (scripts, styles, icons, Google Fonts), and strict live-network bypass for Supabase remote API and auth endpoints.
  2. **Storage Persistence API**: Non-blocking call to `navigator.storage.persist()` on launch to protect client-side IndexedDB against browser eviction, with clear visibility of storage durability status (Persistent vs. Best-Effort), quota estimation, and actionable guidance in Settings.
- **Rejected Alternatives**:
  - *Online-Only Web App*: Fails completely when connection drops, violating the local-first product mandate.
  - *Full HTTP API Caching in Service Worker*: Caching Supabase REST responses in HTTP cache introduces race conditions and conflicts with client-side Dexie.js and OCC queue models.
  - *Silent Storage Assumptions*: Relying on default browser storage without requesting persistent storage quota risks unexpected data eviction on storage-constrained mobile devices.
- **Consequences**: Fast, instant offline app launches, zero offline disruption, and maximum durability against automatic browser storage eviction.
