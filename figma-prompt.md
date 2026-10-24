# Figma Design Prompt: Functional Specification for Expense Management App (Final v1.0)

> **Document Status**: **FROZEN (Final v1.0)**  
> **Notice to Designer / Figma AI**: This prompt describes **functional capabilities, data points, user interactions, and system states only**. It intentionally imposes **zero predetermined visual styles, layout conventions, color schemes, typography choices, or component patterns**. Do **not** assume any specific structural paradigm (such as a sidebar, bottom navigation, card-based grid, or tabbed view). You have full creative freedom to determine the most ergonomic, aesthetically pleasing, and intuitive visual language and spatial arrangement for both mobile and desktop screens. You may combine, split, or rearrange views as long as all functional actions, data fields, and operational states are faithfully represented.

---

## 1. Product Context & Core Objectives
- **Product Name**: Expense Management App
- **Product Type**: Local-First Progressive Web Application (PWA) for personal finance.
- **Core Purpose**: Empower individuals, students, and professionals to log daily expenses and income in seconds, track real account and wallet balances with ledger-backed integrity, and understand their financial position without mandatory login or internet connectivity.
- **Operational Reality**: The application runs 100% offline using client-side IndexedDB storage, with optional Supabase Cloud Synchronization enabling users to work seamlessly across mobile phones and desktop laptops.
- **Design Challenge**: Eliminate all cognitive and operational friction during data entry (<5 seconds Quick Add UX target) while providing absolute clarity between liquid cash and credit card debt on both small touchscreens and large desktop monitors.

---

## 2. Target Users & Behavioral Profiles
- **User Personas**: Everyday individuals, working professionals, and students across diverse technical proficiencies.
- **Usage Modes**:
  - *On the Go (Mobile Phone)*: Fast, one-handed expense recording right at the checkout counter or transit station.
  - *At the Desk (Laptop / Desktop)*: Reviewing monthly spending habits, analyzing category breakdowns, filtering transaction history, exporting CSV files, or managing accounts.
- **Key User Expectations**: Instant feedback, non-destructive form error handling, zero financial jargon, transparent offline/sync status, and bulletproof data privacy.

---

## 3. Product Goals & Design Principles
- **Frictionless Entry**: Zero blocking modals, zero mandatory onboarding questions, and instant access to transaction logging.
- **Financial Clarity**: Strict distinction between liquid assets (Available Funds) and credit debt (Liabilities).
- **Data Safety First**: Non-destructive validation, clear warnings before data-replacing operations, and safe sign-out flows that prevent un-synced data loss.
- **Accessibility & Universality**: Compliant with WCAG 2.1 AA guidelines, supporting keyboard-only navigation on desktop and numeric keypad ergonomics on mobile.

---

## 4. Required Functional Views & Information Architecture

*Note: The division below is logical. You are encouraged to combine, dock, or modularize these functions to best serve the form factor.*

### View 1: Financial Overview / Main Hub
- **Purpose**: Serve as the operational landing view, presenting a complete picture of the user's financial health and offering immediate entry points.
- **Data & Metrics to Display**:
  - **Available Funds (Liquid Assets)**: Total combined balance across all liquid accounts (Cash, Checking/Savings Bank Accounts, Digital Wallets).
  - **Total Liabilities (Debt Owed)**: Total outstanding credit card balances owed.
  - **Net Financial Position**: Available Funds minus Total Liabilities.
  - **Monthly Total Expenses**: Current calendar month expenditure.
  - **Monthly Total Income**: Current calendar month income.
  - **Net Cash Flow**: Monthly Income minus Monthly Expenses.
  - **Month-over-Month Delta**: Percentage increase or decrease in spending relative to the previous month.
  - **Active Accounts List**: Individual accounts showing name, type, and current balance (with clear debt indicators for credit cards).
  - **Recent Activity Ledger**: Chronological list of recent transactions showing date, category/title, account, amount, and type indicator.
  - **Spending Distribution Visualization**: Visual breakdown of current month's expenses across categories.
  - **Cash Flow Trend Visualization**: Visual comparison of income versus expenses over the current period.
  - **Connectivity & Synchronization Status**: Indicator displaying network and sync health (`Online`, `Offline`, `Syncing`, `Synced`, `Pending Changes`, `Sync Warning`, `Merging Data`).
- **User Actions & Triggers**:
  - Primary Quick Action: Launch Quick Add transaction form (prominently accessible from any primary view).
  - Trigger to view full transaction ledger.
  - Trigger to initiate an internal account transfer.
  - Trigger to open accounts management.
  - Trigger to open application settings / cloud sync profile.
  - Tap/click any recent transaction to view details or edit.

---

### View 2: Transaction Ledger, Search & Multi-Filtering
- **Purpose**: Enable users to inspect, search, filter, and audit their complete financial history.
- **Data & Metrics to Display**:
  - Chronologically grouped transaction records (e.g., Today, Yesterday, specific dates).
  - For each transaction: Amount, Type (`Expense`, `Income`, `Transfer`), Category name & icon, Source/Destination Account, Payment Method, Notes snippet (if present), and Tags.
  - Summary header showing total filtered expenditure, total filtered income, and total matching transaction count.
- **Search & Filter Controls**:
  - Keyword search input with live substring matching against notes, descriptions, and category names.
  - Date range selector (Start Date, End Date).
  - Multi-select or toggles for:
    - Transaction Type: All, Expenses, Income, Transfers.
    - Category: Select one or more categories.
    - Account: Select one or more accounts.
    - Payment Method: Select payment instruments.
    - Tags: Select active tags.
  - Action to clear all active filters with one click.
- **User Actions**:
  - Select transaction to view full details, edit, or delete.
  - Quick action to add a new transaction.
  - Contextual CSV Export: When filters are active, allows exporting either the filtered transactions or all transactions.

---

### View 3: Transaction Form (Quick Add & Detailed Mode)
- **Purpose**: Input or modify an expense, income, or internal transfer with maximum speed.
- **Transaction Mode Switcher**: Easily switch between `Expense`, `Income`, and `Transfer`.
- **Primary / Essential Fields (Always Visible)**:
  - **Amount**: High-prominence numeric input. On mobile, automatically focuses and summons the decimal numeric keypad (`inputMode="decimal"`). Enforces positive values with currency symbol.
  - **Category**: Visual selector displaying category names and icons. Mandatory for Expense and Income; disabled/hidden for Transfer.
- **Sensible Defaults (Auto-Populated)**:
  - **Date**: Defaults to current date (editable via date picker).
  - **Account**:
    - For Expense: Defaults to the last-used account (or primary default "Cash").
    - For Income: Defaults to primary deposit account.
    - For Transfer: Source account selector AND Destination account selector (must not allow selecting the exact same account for both).
  - **Payment Method**: Defaults to the instrument associated with the selected account.
- **Secondary / Optional Fields (Expandable via "Add Details")**:
  - **Notes / Description**: Optional text field for vendor, payee, or notes.
  - **Tags**: Optional multi-tag input for custom labeling.
- **User Actions & Keyboard Support**:
  - Confirm / Save transaction action (pressing Enter on desktop saves).
  - Cancel / Dismiss action (pressing Escape on desktop cancels).
  - Delete action (visible only in Edit mode, requiring explicit confirmation).
- **Non-Destructive Validation**: If amount or category is missing, fields remain filled and display clear inline error messages. Entered data is never cleared on validation failure.

---

### View 4: Accounts & Wallets Management
- **Purpose**: Track all financial repositories, monitor credit card debt, and execute internal transfers.
- **Data & Metrics to Display**:
  - Summary of Net Financial Position, Total Liquid Funds, and Total Debt.
  - List of active accounts showing: Name, Type indicator (Cash, Bank, Credit Card, Digital Wallet, Custom), Current derived balance, and last activity timestamp.
  - Credit Card Liability Indicators: Clearly distinguishes owed amounts from positive cash balances.
  - Archived accounts section (if any exist).
- **Create / Edit Account Form**:
  - Account Name input.
  - Account Type selector: Cash, Bank Account, Credit Card, Digital Wallet, Custom.
  - Initial Starting Balance input.
- **Internal Account Transfer Action**:
  - Initiates transfer between two accounts: Source Account, Destination Account, Amount, Date, Notes.
  - Confirmation atomically updates balances of both accounts.
- **User Actions**:
  - Create new account action.
  - Edit account details action.
  - Archive / Unarchive account action.
  - Quick transfer trigger.

---

### View 5: Categories Management
- **Purpose**: Maintain classification rules for income and expense transactions.
- **Functional Requirements**:
  - Users must be able to switch efficiently between Expense Categories and Income Categories.
  - Displays list of categories showing: Name, Icon badge, Color indicator, and whether it is a system default or custom category.
- **Create / Edit Category Form**:
  - Category Name input.
  - Category Type selector: Expense or Income.
  - Icon picker (from a standard icon library).
  - Color picker / swatch selector.
- **User Actions**:
  - Add new category action.
  - Edit category action.
  - Delete category action: Protected by a validation check. If active transactions reference this category, prompts the user to reassign transactions to another category before deletion.

---

### View 6: Reports & Financial Analytics
- **Purpose**: Deep-dive periodic analysis of spending patterns and top expenses.
- **Time Horizon Controls**:
  - Quick interval selectors: Week, Month, Year, Custom Date Range.
- **Data & Metrics to Display**:
  - Total period expenditure and total period income.
  - Category Breakdown Report: Ranked visual and tabular list showing category name, icon, total amount spent, percentage of total expenditure, and transaction count.
  - Top Expenses Ranking: Chronological ranked list of the highest value individual expenses recorded within the selected timeframe.
- **User Actions**:
  - Change reporting period.
  - Select category in report to inspect matching transactions.

---

### View 7: Settings, Data Safety & Cloud Sync
- **Purpose**: Configure application preferences, safeguard data, and manage cloud synchronization.
- **Functional Sections**:
  1. **Currency Configuration**:
     - Displays base currency selector (e.g., USD, EUR, SAR, EGP, AED, GBP, JPY, KWD).
     - **Locked State**: Once transactions or non-zero balances exist, the currency selector is locked with a clear indicator stating: *"Currency is locked because financial records exist. Changing currency without exchange rate conversion is disabled to protect financial accuracy."*
  2. **In-App Daily Reminder**:
     - Toggle switch with time picker (e.g., 20:00).
     - Triggers an in-app reminder prompt when the app is opened past reminder time with zero daily entries.
  3. **Data Backup & Portability**:
     - "Export All to CSV" action (downloads full transaction ledger).
     - "Export JSON Backup" action (downloads complete backup of accounts, categories, and transactions).
     - "Restore JSON Backup" action (triggers the atomic restore pipeline).
     - Storage Durability Status: Shows whether browser storage is "Persistent" or "Best-Effort" with an action to request persistence.
     - Guest Mode Notice: Informative explanation clarifying that data is currently in browser storage and recommending cloud sync or regular JSON export.
  4. **Cloud Synchronization & Authentication (Supabase)**:
     - Authentication State: Displays whether operating in Guest Mode or Authenticated User.
     - Guest Mode: Action to "Sign In / Register" to enable multi-device sync between phone and laptop.
     - Authenticated State: Displays user email, last sync timestamp, and "Sign Out" action.
     - Manual "Sync Now" action trigger.
     - Connectivity & Sync Diagnostics display.

---

## 5. First-Time User Experience (FTUX) & Empty States
- **First Launch (Zero Configuration)**:
  - App opens instantly without any blocking splash screens or registration forms.
  - System silently seeds default categories (with deterministic slugs) and a "Cash" account with initial balance = 0.
  - Main Hub displays a welcoming empty state:
    - Primary Call-to-Action: *"Log your first expense"* (opens Quick Add).
    - Secondary Helper: *"Set starting balance"* (inline 1-tap modal to set starting cash).
- **Subsequent Empty States**:
  - Search / Filter yielding 0 results: Informs user that no transactions match the active criteria with an action to clear all filters.
  - Empty category or account states with clear creation guidance.

---

## 6. Critical System States & Edge Cases

### State 1: Connectivity & Synchronization States
- **Offline**: Device has no internet connection. The app continues to work at 100% speed locally. Status indicator clearly shows Offline mode.
- **Syncing**: Background synchronization with Supabase is actively sending or receiving mutations.
- **Synced**: All local IndexedDB data and cloud Supabase tables are verified identical (`pending_mutations == 0`).
- **Pending Changes**: Local transactions created or modified offline waiting for internet connection. Displays pending mutation count.
- **Sync Warning (Concurrency Conflict)**: A conflict occurred because the same record was updated on another device. Displays a non-intrusive warning informing the user that the server version was kept as canonical and their local edit was saved to the local conflict audit log.
- **Merging Data**: In-progress reconciliation during first-time sign-in from guest mode.

### State 2: Sign-Out Safety & Data Loss Prevention
- **Sign-Out Blocked (Un-Synced Changes Exist)**:
  - If a user attempts to sign out while offline mutations are pending or failed, the action is **blocked**.
  - A prominent safety dialog appears:
    > *"You have [N] un-synced changes on this device. Signing out now will permanently remove them from this browser. Please reconnect to sync, or export a local JSON backup before signing out."*
  - Available Actions: [Sync Now] / [Download Backup JSON] / [Cancel].
- **Safe Sign-Out (All Data Synced)**:
  - When verified that zero mutations are pending, the user confirms sign-out.
  - Local cloud cache is safely cleared from the browser to protect privacy on shared devices, returning the app to fresh Guest Mode.

### State 3: Backup & Atomic Restore Pipeline
- **Step 1: Upload & Validation**: User selects JSON file. System validates schema, version, entity counts, and base currency match.
- **Step 2: Preview Information**: Modal displays backup metadata: Backup Date, Base Currency, Number of Accounts, Categories, and Transactions.
- **Step 3: Explicit Confirmation**: Warns the user that restoring will replace current local data. Informs them that a pre-restore safety snapshot will be automatically created.
- **Step 4: Atomic Execution & Feedback**: System updates database atomically. Displays success confirmation toast upon completion.

### State 4: Error & Validation Handling
- **Form Validation Errors**: Missing amount, invalid characters, or missing mandatory category. Inline error messages appear immediately without clearing any previously entered text.
- **Storage Quota Warning (`QuotaExceededError`)**: Intercepts storage exhaustion and advises user to export a backup and purge historical records.
- **Currency Change Locked Notice**: Friendly tooltip/modal explaining why currency cannot be modified once transactions exist.

---

## 7. Responsive Behavior Guidelines
- **Mobile Handheld (360px - 767px)**:
  - Optimized for thumb-zone accessibility and fast single-handed input.
  - Quick Add trigger positioned within comfortable reach.
  - Automatic focus on numeric keypad (`inputMode="decimal"`) during transaction entry.
  - Information-dense lists with expandable rows for secondary details.
- **Desktop & Laptop (768px - 1440px+)**:
  - Efficient utilization of wide screen space without excessive empty margins.
  - Ability to view transaction ledger alongside active filters or summary metrics.
  - Desktop keyboard shortcuts: Enter confirms forms, Escape cancels/dismisses, search input quick-focus.
  - Rich visual presentations for financial charts and category breakdowns.

---

## 8. Accessibility Requirements (WCAG 2.1 AA)
- Every interactive element has an explicit, accessible label.
- High visual contrast ratios for text and numerical amounts.
- Visible, distinct focus indicators for all interactive buttons and inputs.
- All forms and modals fully navigable and dismissable using the keyboard alone.

---

## 9. Design Deliverables Expected
Please provide complete mobile (390px) and desktop (1440px) design artboards depicting:
1. **Financial Overview / Main Hub** (populated state and first-time empty state).
2. **Transaction Ledger & Multi-Filtering** (showing active filters and search results).
3. **Transaction Form** (Quick Add default mode, expandable details mode, and validation error state).
4. **Internal Account Transfer Form** (showing source and destination account selection).
5. **Accounts & Wallets View** (showing liquid balances, credit card liabilities, and transfer actions).
6. **Categories Management View** (showing expense and income category listings and creation form).
7. **Reports & Financial Analytics View** (showing category breakdown and top expenses ranking).
8. **Settings View** (showing locked currency state, in-app reminder config, and storage durability status).
9. **Cloud Sync & Safety States**:
   - Status indicators: Offline, Syncing, Synced, Pending Changes, Sync Warning.
   - Sign-Out Blocked Dialog (with un-synced data warning and backup action).
   - Backup Restore Modal (with metadata preview and confirmation).
