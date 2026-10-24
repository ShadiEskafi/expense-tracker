# Expense Management App - Project Specification (Final v1.0)

> **Document Status**: **FROZEN (Final v1.0)**  
> **Authoritative Role**: Single Source of Truth for Architecture, Data Integrity, and Functional Requirements.  
> **Priority Hierarchy**: Data Integrity → Data Safety → Functional Correctness → User Experience → Simplicity → Performance.

---

## 1. Project Overview
The Expense Management App is a high-reliability, **Local-First** Progressive Web Application (PWA) designed to give users frictionless, instant control over their personal finances. Built with React and Vite, it utilizes client-side storage (IndexedDB via Dexie.js) as its primary database, operating 100% offline without requiring mandatory account registration or internet connectivity. For users operating across multiple devices (smartphones, tablets, laptops), the application provides seamless, optional Cloud Synchronization and Authentication powered by Supabase.

---

## 2. Problem Statement
Many personal finance applications impose unnecessary friction and data risks:
- Forcing mandatory registration and internet connectivity before basic expense logging can occur.
- Over-complicating daily tracking with multi-tier subcategories, strict budgeting overhead, or mandatory bank integrations.
- Slow entry flows that discourage users from logging expenses at the point of sale.
- Misrepresenting financial health by blurring the line between liquid cash and credit card debt liabilities.
- Flawed multi-device synchronization that causes silent data overwrites, duplicate accounts, or data loss during sign-out.
- Floating-point calculation errors in financial totals.

Users require a fast, fail-safe application to record daily transactions, track real account and wallet balances, and understand their financial position in seconds—online or offline—with absolute data integrity.

---

## 3. Product Goals
- **Instant Usability**: Zero mandatory onboarding barriers; users can record transactions within 5 seconds of opening the app (UX target).
- **Local-First Independence**: 100% core functionality without internet access using client-side IndexedDB persistence.
- **Frictionless Cross-Device Continuity**: Optional Supabase authentication enabling real-time cloud backup, deterministic data merging, and safe multi-device synchronization across mobile and laptop devices.
- **Strict Financial Precision**: Ledger-based calculations where transactions are the single source of truth for account balances, using ISO 4217 Integer Minor Units to eliminate floating-point rounding errors.
- **Transparent Asset & Liability Distinction**: Clear separation between Available Liquid Funds, Credit Card Liabilities, Net Financial Position, and Period Cash Flow.
- **Data Sovereignty & Safety**: User ownership of data with complete JSON backup/restore, CSV export, and persistent browser storage support.

---

## 4. Target Users
- **Primary Persona**: Everyday individuals, working professionals, and students across diverse technical backgrounds.
- **User Characteristics**:
  - Value speed, privacy, and simplicity.
  - Frequently switch between mobile phones (on the go) and laptops (at desk or work).
  - Require reliable offline tracking in transit, remote locations, or unstable connectivity.
  - Prefer immediate logging without entering lengthy questionnaires.

---

## 5. Product Scope (MVP Boundaries)
The initial release (MVP) strictly covers:
- Expense, income, and internal transfer tracking.
- Multi-account and wallet balance management with ledger-backed integrity.
- Fast "Quick Add" transaction entry flow.
- Customizable single-level categories with deterministic defaults.
- Financial dashboard with KPIs and visual trend charts.
- Comprehensive search and multi-filtering.
- Filterable reports and top expense breakdowns.
- Local-first IndexedDB engine with Persistent Storage API integration.
- Offline mutation queue with Optimistic Concurrency Control (OCC) and server-stamped revision tracking.
- Deterministic initial data merging on login.
- Fail-safe sign-out policy preventing un-synced data loss.
- Full JSON backup & atomic restore pipeline, plus CSV transaction export (All and Filtered).
- In-app daily logging reminder prompt and contextual operation feedback.

**Strictly Out of Scope for MVP (Deferred to Future Enhancements)**:
- Budgeting limits and warning thresholds.
- Recurring transactions and subscription auto-generation.
- Background scheduled push notifications while the browser/PWA is completely closed.
- Receipt image uploads and camera OCR scanning.
- Live foreign exchange rate API integration and multi-currency conversion per account.
- Shared family/collaborative accounts or multi-user budgets.
- AI-driven automated transaction categorization.

---

## 6. Core Features Summary
1. **Transaction Logging**: Fast recording, editing, and soft-deletion of expenses, income, and transfers.
2. **Account & Wallet Management**: Balance tracking across Cash, Bank, Credit Card, and Digital Wallets with single-record internal transfers.
3. **Category System**: Pre-populated defaults, custom category CRUD, color coding, and icons (single-tier).
4. **Financial Overview**: Real-time visibility into Available Funds, Liabilities, Net Position, and Monthly Cash Flow.
5. **Visual Trend Analysis**: Category expense distribution and period cash-flow trends.
6. **Search & Multi-Filter**: Query by text, type, category, date range, account, tags, and payment method.
7. **Local-First Engine**: Primary local IndexedDB persistence, UUIDs for all entities, and offline mutation queuing.
8. **Optional Cloud Synchronization**: Supabase Auth with deterministic merging, idempotent replays, and OCC conflict resolution.
9. **Data Portability & Safety**: Full JSON backup and atomic restore, plus CSV transaction export.
10. **In-App Reminders & Feedback**: In-app daily logging reminder prompt and contextual toast alerts.

---

## 7. Expense Management
- **Transaction Types Supported**: Expense (`outflow`), Income (`inflow`), Transfer (`internal_transfer`).
- **Expense Fields**:
  - `id`: Unique identifier (UUID v4).
  - `amount`: Monetary value stored as Integer Minor Units (according to currency exponent, e.g. cents).
  - `date`: Transaction date (ISO 8601 `YYYY-MM-DD`, defaults to current date).
  - `category_id`: Mandatory reference to a valid category.
  - `account_id`: Mandatory reference to the source account/wallet from which funds are deducted.
  - `payment_method`: Optional payment instrument descriptor (e.g., Cash, Debit Card, Credit Card, E-Wallet; defaults to account type).
  - `notes`: Optional free-text description/notes.
  - `tags`: Optional list of string tags for flexible indexing and grouping.
  - `created_at`: Creation timestamp (ISO UTC).
  - `updated_at`: Modification timestamp (ISO UTC).
  - `deleted_at`: Soft-delete timestamp (nullable, ISO UTC).
  - `sync_version`: Monotonic revision counter for concurrency control.
- **Operations**:
  - Create new expense with instant balance reduction in the designated account.
  - Edit existing expense fields with automatic account balance recalculation from the ledger.
  - Soft-delete expense with balance restoration.

---

## 8. Income Management
- **Purpose**: Record incoming funds to compute accurate net balances and savings.
- **Income Fields**:
  - `id`: UUID v4.
  - `amount`: Monetary value in Integer Minor Units.
  - `date`: ISO 8601 date (defaults to today).
  - `category_id`: Mandatory income category (e.g., Salary, Freelance, Investment, Gift).
  - `account_id`: Destination account/wallet credited with the income.
  - `payment_method`: Optional payment instrument descriptor.
  - `notes`: Optional notes.
  - `tags`: Optional tags.
  - `created_at`, `updated_at`, `deleted_at`, `sync_version`.
- **Operations**:
  - Add income transaction with immediate balance addition to the selected account.
  - Edit and soft-delete income records with automated balance adjustments.

---

## 9. Categories
- **Structure**: Single-level hierarchy to maximize entry speed (no nested subcategories).
- **Deterministic Default Categories**: Pre-populated with fixed system keys (`slug`) scoped per user, ensuring they merge cleanly across devices without duplicating:
  - *Expense*: Food & Dining (`cat_food`), Groceries (`cat_groceries`), Transportation (`cat_transport`), Housing & Utilities (`cat_housing`), Healthcare (`cat_health`), Shopping (`cat_shopping`), Entertainment (`cat_entertainment`), Education (`cat_education`), Personal Care (`cat_personal`), Miscellaneous (`cat_misc`).
  - *Income*: Salary (`cat_salary`), Freelancing (`cat_freelance`), Business (`cat_business`), Investments (`cat_investments`), Gifts (`cat_gifts`), Other Income (`cat_other_income`).
- **Customization Capabilities**:
  - Create new custom categories.
  - Edit category name, associated icon identifier, and color code.
  - Delete category (system prevents deletion if active non-deleted transactions are associated, offering reassignment).
- **Attributes**:
  - `id` (UUID), `user_id` (Nullable UUID), `slug` (Nullable String for system defaults), `name` (String), `type` (`expense` | `income`), `icon` (Icon identifier string), `color` (Hex/Color code), `is_default` (Boolean), `created_at`, `updated_at`, `deleted_at`, `sync_version`.

---

## 10. Budgets
- **Status in MVP**: **Deferred to Post-MVP**.
- **Reasoning**: User requirement for maximum simplicity and zero friction during the initial phase. Future releases will introduce optional overall monthly limits and per-category budget thresholds.

---

## 11. Accounts, Wallets & Financial Position
### Single Source of Truth
- The transaction ledger is the sole authoritative source of truth for all account balances.
- Balance formula:
  $$\text{Balance}(A) = \text{initial\_balance} + \sum \text{Income}(A) - \sum \text{Expense}(A) + \sum \text{Transfers To}(A) - \sum \text{Transfers From}(A)$$
- Transactions flagged with `deleted_at IS NOT NULL` are strictly excluded from calculations.

### Performance Caching & Reconciliation
- `current_balance` on the `Account` record is a derived cache used exclusively for fast UI rendering.
- Any transaction mutation immediately recalculates or applies the delta to `current_balance`.
- A reconciliation routine runs upon application launch and after every sync batch to guarantee that cached balances match the ledger sum.

### Account Types & Credit Card Rules
1. `Cash`: Physical cash on hand.
2. `Bank Account`: Checking and savings accounts.
3. `Digital Wallet`: Electronic payment services (PayPal, Apple Pay, etc.).
4. `Credit Card`: Revolving credit line.
   - Credit card balances represent financial **Liabilities (Debt)**.
   - Purchases on a credit card are logged as Expenses with `account_id = credit_card_id` (increasing the liability owed).
   - **Credit Card Payments / Bill Settlements**: Treated as an **Internal Transfer** from a Cash or Bank account to the Credit Card account. This reduces the cash balance and decreases the credit card liability. It is **never** logged as a new expense, preventing double-counting of the original purchases.
5. `Custom Account`: User-defined financial repository.

### Distinct Financial Position Metrics
The application maintains clear definitions and never blurs debt with liquid assets:
- **Available Funds (Liquid Assets)**: Sum of all positive balances in liquid accounts (Cash + Bank Accounts + Digital Wallets).
- **Total Liabilities (Debt Owed)**: Sum of all outstanding credit card liabilities.
- **Net Financial Position**: Available Funds minus Total Liabilities.
- **Net Cash Flow (Period-Specific)**: Total Income minus Total Expenses for the chosen calendar period (independent of transfers).

### Internal Account Transfers
- Stored as a **single unified transaction record** of `type = 'transfer'` containing `account_id` (Source) and `destination_account_id` (Destination).
- Atomically deducts `amount` from source and credits `amount` to destination.
- Eliminates orphan transaction legs, duplicate records, or out-of-order partial synchronization.
- Transfers do not count as Income or Expense and do not alter Net Financial Position.

---

## 12. Currencies & Precision
- **Single Base Currency Principle**: The MVP supports exactly one base currency per financial dataset.
- **Currency Setup & Immutability**:
  - The currency can be configured during first-time launch or in Settings before financial records are created.
  - **Locking Rule**: Once transactions or non-zero initial balances exist, the currency is **locked** and cannot be changed directly in MVP.
  - Changing the currency symbol without real exchange rate calculation is strictly forbidden to prevent misleading financial records.
  - Automated currency conversion and Multi-Currency accounts are deferred to post-MVP.
- **Monetary Precision via ISO 4217 Minor Units**:
  - All financial amounts are stored as **Integer Minor Units** based on the ISO 4217 exponent:
    - 2 decimals: USD, EUR, SAR, EGP, AED, GBP (`multiplier = 100`).
    - 0 decimals: JPY, KRW (`multiplier = 1`).
    - 3 decimals: KWD, BHD, OMR (`multiplier = 1000`).
  - Storing integers completely eliminates floating-point precision anomalies (`0.1 + 0.2 !== 0.3`).
  - Formatting is handled via `Intl.NumberFormat(locale, { style: 'currency', currency })`.

---

## 13. Dashboard
The primary overview displaying verified financial indicators:
1. **Financial Overview Metrics**:
   - Total Monthly Expenses (current calendar month).
   - Total Monthly Income (current calendar month).
   - Net Cash Flow for the month (Income minus Expenses).
   - Month-over-Month Comparison indicator (percentage delta relative to previous month).
   - Available Liquid Funds.
   - Total Liabilities (Credit Card Debt).
   - Net Financial Position (Available Funds minus Liabilities).
2. **Account / Wallet Balances**:
   - Individual balances for each active account with clear liability badges for credit lines.
3. **Recent Activity**:
   - Chronological list of the most recent transactions with type, account, category, and amount.
   - Primary Quick Add action trigger accessible immediately.
4. **Visual Analytics Widgets**:
   - Category Breakdown Chart (Donut / Pie) displaying current month's expense distribution.
   - Cash Flow Trend Chart (Bar / Line) comparing income versus expenses across the period.
5. **Sync & Connectivity Status Indicator**: Real-time display of network and sync health.

---

## 14. Reports and Analytics
Dedicated reporting interface providing deep visibility into spending habits:
1. **Time Horizon Filters**:
   - Preset selectors: *This Week*, *This Month*, *This Year*, or *Custom Date Range* (Start Date to End Date).
2. **Category Breakdown Report**:
   - Visual breakdown and ranked list of all categories with total spent, percentage of total expenditure, and transaction counts.
3. **Top Expenses Ranking**:
   - Ordered list of the highest value individual expenses recorded within the selected timeframe.

---

## 15. Search and Filtering
Comprehensive filtering tools accessible within the Transactions view:
- **Keyword Search**: Real-time substring search against transaction notes, category names, and descriptions.
- **Transaction Type Filter**: All, Expenses Only, Income Only, Transfers Only.
- **Category Filter**: Filter by one or more categories.
- **Date Range Filter**: Specific date picker (from `start_date` to `end_date`).
- **Account / Wallet Filter**: Filter transactions associated with a specific account.
- **Payment Method Filter**: Filter by payment instrument (Cash, Card, etc.).
- **Tags Filter**: Filter by one or more user-defined tags.

---

## 16. Recurring Transactions
- **Status in MVP**: **Deferred to Post-MVP**.
- **Reasoning**: Excluded from the MVP scope to maintain a lightweight, fail-safe local-first transaction engine. Manual entry ensures users have complete deliberate control over each recorded balance.

---

## 17. Notifications & Reminders
- **Technical Clarification on Background Notifications**:
  - Automated push notifications while the browser/PWA is completely closed require a 24/7 backend push server (Web Push Protocol, VAPID infrastructure, backend worker daemons). To preserve local-first simplicity, background scheduled push notifications are classified under **Future Enhancements**.
- **MVP Reminder Implementation**:
  - **In-App Daily Reminder**: When the user opens the app, if no expense has been recorded for the current calendar day and the current time is past their configured reminder time (e.g., after 20:00), an in-app prompt gently reminds them: *"You haven't logged any expenses for today yet."*
  - Active-Session Notification: If the browser/PWA tab is active or minimized in the background at the specified time, a local Notification API alert is triggered if permissions were granted.
  - Can be toggled on/off with custom reminder time in Settings.
- **In-App Operation Feedback (Toast Notifications)**:
  - Immediate non-blocking toast alerts for user operations: successful creation, update, deletion, transfer completion, backup export, and sync state changes.

---

## 18. Cloud Synchronization & Concurrency Architecture
### Local-First Model
All user interactions execute against IndexedDB first. The UI never blocks on network latency.

### Optimistic Concurrency Control (OCC) Strategy
1. **Local Mutation Logging**:
   - When an entity is created, updated, or soft-deleted, the change is written to IndexedDB immediately.
   - An entry is atomically added to `offline_mutation_queue`:
     - `id`: UUID v4.
     - `entity_type`: `'account'` | `'category'` | `'transaction'`.
     - `entity_id`: UUID.
     - `action`: `'UPSERT'` | `'DELETE'`.
     - `client_base_version`: Current `sync_version` known to client.
     - `payload`: Full JSON snapshot of the entity.
     - `client_timestamp`: ISO UTC timestamp.
     - `status`: `'pending'`.
2. **Queue Dispatch & Server Verification**:
   - When online and authenticated, mutations are sent in FIFO sequence to a Supabase RPC function (`sync_mutation`).
   - The RPC executes an Optimistic Concurrency check:
     ```sql
     -- Example conceptual logic in Supabase RPC
     SELECT sync_version FROM transactions WHERE id = mutation.entity_id;
     ```
   - **Case A: No Conflict (`server.sync_version == mutation.client_base_version`)**:
     - The write is accepted.
     - Server stamps `server_updated_at = NOW()` and increments `sync_version = server.sync_version + 1`.
     - Returns success with the new version.
     - Client updates its local entity `sync_version` and marks the queue item `completed` (removing it from the queue).
   - **Case B: Concurrency Conflict (`server.sync_version != mutation.client_base_version`)**:
     - Another device modified this record in the interim.
     - **Safety Guarantee**: The client's local change is **never silently dropped**.
     - The client's conflicting edit is copied to a local `conflict_audit_log` table in IndexedDB.
     - The server's canonical version is pulled and applied to IndexedDB.
     - The user is alerted with a non-intrusive Sync Warning:
       > *"Sync conflict resolved: [Record] was updated on another device. Your local edit has been saved to your local conflict log."*
3. **Idempotency**:
   - Every mutation has a unique UUID. If a network drop occurs during response receipt, replaying the same mutation UUID is detected by Supabase as a duplicate and returns the previously processed result without repeating balance changes.
4. **Pulling Remote Updates**:
   - Client queries changes where `server_updated_at > last_sync_timestamp`.
   - Soft-deleted records (`deleted_at IS NOT NULL`) are applied locally so deleted items are removed from active queries.
5. **Definition of "Synced"**:
   - An entity is only treated as `Synced` when Supabase returns an explicit 200/success response. The client status pill updates to `Synced` only when `pending_mutations_count == 0`.

---

## 19. Initial Data Merge (First-Time Login)
When a user who has been using the app in Guest Mode signs in or registers via Supabase Auth:
1. **Preserve All Local Records**: All local guest transactions and accounts are retained.
2. **Deterministic Default Category Deduplication**:
   - Default categories are matched by their system `slug` (e.g. `cat_food`).
   - If the cloud account already contains `cat_food`, local transactions referencing the guest `cat_food` are re-pointed to the cloud category's UUID.
   - Duplicate default categories are never created.
3. **Account Independence (No Blind Merging)**:
   - Accounts are **never merged based solely on matching names or types**.
   - If the local guest has a "Cash" account and the cloud has a "Cash" account, they are kept as distinct accounts (e.g., "Cash" and "Cash (Imported)") unless one has zero transactions.
   - Prevents accidental mingling of different bank accounts or cash reserves.
4. **Transaction Relationship Integrity**:
   - Foreign keys (`account_id`, `category_id`, `destination_account_id`) are verified before upload.
   - All guest entities are assigned `user_id = auth.uid()` and queued for upload via idempotent upsert.

---

## 20. Fail-Safe Sign-Out & Privacy Protection
### Shared Device Safety vs. Data Loss Prevention
1. **Pending Changes Check**:
   - Before signing out, the system inspects `offline_mutation_queue`.
2. **Blocking Sign-Out with Un-synced Data**:
   - If any mutations are `'pending'` or `'failed'`, **sign-out is blocked** from clearing local data.
   - The user is presented with an unavoidable safety modal:
     > *"You have [N] un-synced changes on this device. Signing out now will permanently remove them from this browser. Please reconnect to sync, or export a local JSON backup before signing out."*
     - Actions: [Sync Now] / [Download Backup JSON] / [Cancel].
3. **Safe Sign-Out Execution**:
   - Once all local changes are verified `Synced` (`pending == 0`), the user confirms sign-out.
   - Cloud-synced user records are purged from local IndexedDB to protect financial confidentiality on shared devices.
   - The application resets to a clean, fresh Guest Mode.
4. **Switching Accounts**:
   - Signing into a different account always purges previous cached records before hydrating the new account from Supabase.

---

## 21. Local Storage Reliability & Persistent Storage API
- **Reality of Browser Storage**: IndexedDB is persistent across standard browser restarts, but can be evicted by browsers under extreme disk pressure or when users manually clear browsing data.
- **Persistent Storage API**:
  - The application calls `navigator.storage.persist()` on launch.
  - Storage status (Persistent vs. Best-Effort) is displayed in Settings.
- **Storage Quota Handling**:
  - Catches `QuotaExceededError` gracefully.
  - Notifies user with actionable guidance (export JSON backup or clean up historical records).
- **Guest Mode Disclosure**:
  - In Settings, an unobtrusive notice clarifies:
    > *"Your financial data is currently stored in this browser. To protect against accidental browser cache clearing, regularly download a JSON backup or enable free Cloud Sync."*

---

## 22. Backup & Atomic Restore Pipeline
The application implements a single, strict, atomic restore workflow:
1. **Validation**: Validate file structure, schema version, required entity arrays, and currency consistency.
2. **Preview**: Display backup metadata to user: Creation Date, Base Currency, Account Count, Category Count, Transaction Count.
3. **Explicit Confirmation**: User must confirm replacement of current local data.
4. **Automatic Safety Snapshot**: App automatically creates a local rollback snapshot of current state before proceeding.
5. **Atomic Execution**: All tables in IndexedDB are updated within a single Dexie transaction. If an error occurs, the pre-restore snapshot is restored.
6. **Cloud Sync Coordination**:
   - If the user is authenticated with Supabase, restoring a backup marks restored records as new mutations with incremented versions to push the restored state, avoiding resurrection of previously deleted records.

---

## 23. First-Time User Experience (FTUX) & Quick Add Flow
### First-Time Experience
- No splash blockers, forced registrations, or multi-step questionnaires.
- App self-seeds standard categories (deterministic slugs) and a default "Cash" account (initial balance = 0).
- User lands directly on Dashboard with empty state inviting them to:
  - Primary Action: *"Log your first expense"* (launches Quick Add).
  - Secondary Helper: *"Set starting balance"* (inline 1-tap modal).

### Quick Add Transaction Flow (<5 Seconds UX Target)
- **Mandatory Fields**: Amount & Category only.
- **Auto-Populated Defaults**:
  - Amount input is auto-focused with `inputMode="decimal"` on mobile.
  - Date defaults to current date (`today`).
  - Account defaults to last-used account (or "Cash").
  - Payment Method defaults to account instrument.
- **Optional Details (Collapsible)**: Notes, Tags.
- **Non-Destructive Validation**: If amount is missing or invalid, fields remain populated with inline error indicators; user input is never wiped.

---

## 24. Main Functional Screens
1. **Dashboard (Main Hub)**: Financial KPIs (Available Funds, Liabilities, Net Position, Monthly Cash Flow), account list, quick add trigger, category breakdown chart, cash flow trend chart, and recent transaction list.
2. **Transactions View**: Chronological transaction ledger, search input, multi-faceted filter drawer/panel, transaction detail view, edit/delete actions, and CSV export action.
3. **Transaction Form (Quick Add & Detailed)**: Mode selector (`Expense`, `Income`, `Transfer`), essential fields (Amount, Category), defaults (Date, Account), and collapsible details (Notes, Tags, Payment Method).
4. **Accounts & Wallets View**: List of all accounts with current derived balances, liability indicators for credit cards, new account creation, account edit/archive, and internal transfer trigger.
5. **Categories View**: Unified management for Expense and Income categories, list with icon and color badges, and modal form for custom category CRUD with transaction reassignment.
6. **Reports & Analytics View**: Time interval selectors (Week, Month, Year, Custom), category expenditure breakdown with percentages and totals, and top expenses ranking.
7. **Settings & Data Safety View**: Currency selector (locked once data exists), in-app daily reminder toggle and time picker, CSV export (All / Filtered), JSON Backup & Atomic Restore, Storage durability status, and Cloud Sync / Supabase Authentication management.
8. **Cloud Sync & Account State**: Status display showing real-time state (`Offline`, `Synced`, `Syncing`, `Pending Changes`, `Sync Warning`, `Merging Data`), manual sync trigger, and sign-out safety flow.

---

## 25. Functional Requirements (Traceability Matrix)
- `FR-01`: Create expense with mandatory amount and category; defaults date to today and account to last-used.
- `FR-02`: Create income with mandatory amount, category, and destination account.
- `FR-03`: Execute internal transfer between two accounts as a single transaction record, updating both balances atomically.
- `FR-04`: Edit transaction fields, triggering automatic ledger-based balance recalculation.
- `FR-05`: Soft-delete transaction (`deleted_at`), restoring account balance.
- `FR-06`: Assign optional notes, payment method, and tags without blocking fast entry.
- `FR-07`: Create accounts (Cash, Bank, Credit Card, Digital Wallet, Custom) with initial balance.
- `FR-08`: Compute account balances strictly from transaction ledger with cached performance acceleration.
- `FR-09`: Display credit card balances as liabilities; credit card payments handled as transfers reducing liability.
- `FR-10`: Display distinct metrics: Available Funds, Total Liabilities, Net Position, and Period Cash Flow.
- `FR-11`: Pre-seed deterministic default categories identified by fixed slugs.
- `FR-12`: Custom category CRUD with transaction reassignment protection upon deletion.
- `FR-13`: Dashboard metrics: Monthly expenses, income, net cash flow, MoM delta, trend charts.
- `FR-14`: Filter transactions by type, category, date range, account, payment method, and tags.
- `FR-15`: Export all transactions to CSV; export filtered transactions when filters are active.
- `FR-16`: Export complete JSON backup; execute atomic JSON restore with pre-restore rollback snapshot.
- `FR-17`: Base currency configured on launch; locked against direct change once transactions exist.
- `FR-18`: In-app daily reminder prompt if opened past reminder time with zero daily entries.
- `FR-19`: Local-first IndexedDB operations with ISO 4217 Integer Minor Units precision.
- `FR-20`: Offline mutation queue with Optimistic Concurrency Control, version verification, and conflict archiving.
- `FR-21`: First-time login deduplicates default categories by slug and preserves all local transactions.
- `FR-22`: Block sign-out if un-synced mutations exist; purge local cloud cache only upon confirmed sync.
- `FR-23`: Request persistent browser storage via `navigator.storage.persist()` and handle quota errors gracefully.

---

## 26. Data Model Overview
```text
User (Supabase Auth)
├── id: UUID (Primary Key)
├── email: String
└── created_at: Timestamp (ISO UTC)

Account
├── id: UUID (Primary Key)
├── user_id: UUID (Nullable, foreign key to User when signed in)
├── name: String
├── type: Enum ('cash', 'bank', 'credit_card', 'digital_wallet', 'custom')
├── initial_balance: Integer (Minor Units)
├── current_balance: Integer (Minor Units, cached from ledger)
├── currency: String(3)
├── is_archived: Boolean
├── created_at: Timestamp (ISO UTC)
├── updated_at: Timestamp (ISO UTC)
├── deleted_at: Timestamp (Nullable, ISO UTC)
└── sync_version: Integer

Category
├── id: UUID (Primary Key)
├── user_id: UUID (Nullable)
├── slug: String (Nullable, unique system identifier for defaults e.g. 'cat_food')
├── name: String
├── type: Enum ('expense', 'income')
├── icon: String
├── color: String
├── is_default: Boolean
├── created_at: Timestamp (ISO UTC)
├── updated_at: Timestamp (ISO UTC)
├── deleted_at: Timestamp (Nullable, ISO UTC)
└── sync_version: Integer

Transaction
├── id: UUID (Primary Key)
├── user_id: UUID (Nullable)
├── type: Enum ('expense', 'income', 'transfer')
├── amount: Integer (Minor Units, always positive)
├── date: Date (YYYY-MM-DD)
├── category_id: UUID (Foreign Key to Category, null for transfers)
├── account_id: UUID (Foreign Key to Account: source for expense/transfer, destination for income)
├── destination_account_id: UUID (Foreign Key to Account, used exclusively for transfers)
├── payment_method: String (Optional)
├── notes: Text (Nullable)
├── tags: Array of Strings (Nullable)
├── created_at: Timestamp (ISO UTC)
├── updated_at: Timestamp (ISO UTC)
├── deleted_at: Timestamp (Nullable, ISO UTC)
└── sync_version: Integer

OfflineMutation
├── id: UUID (Local IndexedDB only)
├── entity_type: Enum ('account', 'category', 'transaction')
├── entity_id: UUID
├── action: Enum ('UPSERT', 'DELETE')
├── client_base_version: Integer
├── payload: JSON
├── client_timestamp: Timestamp (ISO UTC)
├── retry_count: Integer
└── status: Enum ('pending', 'syncing', 'failed')

ConflictAuditLog
├── id: UUID (Local IndexedDB only)
├── entity_type: String
├── entity_id: UUID
├── client_payload: JSON
├── server_payload: JSON
├── resolved_at: Timestamp (ISO UTC)
└── resolution_note: String
```

---

## 27. Security and Privacy Requirements
- **Local Privacy**: User data stays strictly on the client device inside IndexedDB when in Guest Mode.
- **Shared Device Protection**: Confirmed sign-out purges local cloud cache to prevent previous user data from appearing to subsequent users.
- **Cloud Transport Security**: All communications with Supabase occur over TLS 1.3 encryption.
- **Row-Level Security (RLS)**: Enforced on all Supabase PostgreSQL tables:
  ```sql
  CREATE POLICY "Users can only access their own data"
  ON transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
  ```
- **Soft Deletion**: Records are flagged with `deleted_at` rather than instantly dropped, ensuring deletion state propagates reliably during cross-device synchronization before purging.
- **Environment Separation**: API keys for Supabase are divided into public publishable keys (`anon_key`) and private service keys (never bundled in client).

---

## 28. Final Product Definition
The **Expense Management App** is an autonomous, ultra-fast **Local-First Personal Finance PWA** that enables individuals, students, and professionals to track daily expenses, monitor income, and oversee multi-account balances effortlessly. It delivers 100% offline functionality, integer-precision financial integrity, and instantaneous feedback through IndexedDB, while providing optional, seamless Supabase Cloud Synchronization for cross-device continuity across smartphones and laptops.
