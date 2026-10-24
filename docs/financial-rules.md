# Financial Accounting Rules & Calculation Engine

> **System**: Expense Management App  
> **Status**: Authoritative Accounting Specification  
> **Reference**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) & [DECISIONS.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/DECISIONS.md)

---

## 1. Single Source of Truth: The Transaction Ledger
- All account balances are mathematically derived from the transaction ledger.
- Account `current_balance` is purely an ephemeral performance cache.
- The balance calculation formula:
  $$\text{Balance}(A) = \text{initial\_balance} + \text{Inflows}(A) - \text{Outflows}(A) + \text{TransfersIn}(A) - \text{TransfersOut}(A)$$
- **Soft-Delete Rule**:
  - Any transaction with `deleted_at IS NOT NULL` is completely ignored in balance calculations.
  - Setting `deleted_at` on an expense immediately restores the account balance.
  - Setting `deleted_at` on an income immediately reduces the account balance.
  - Setting `deleted_at` on a transfer restores both source and destination account balances.

---

## 2. Integer Minor Units & Zero Floating-Point Tolerance
- Standard JavaScript floating-point numbers (`IEEE 754`) accumulate rounding errors (e.g. `0.1 + 0.2 = 0.30000000000000004`).
- **Rule**: All monetary values are strictly converted to and stored as **Integer Minor Units** based on ISO 4217 minor unit exponent:
  - Exponent 2 (e.g., SAR, USD, EUR, EGP, AED, GBP): Multiplier = 100 ($10.50 -> `1050`).
  - Exponent 0 (e.g., JPY, KRW): Multiplier = 1 (¥1000 -> `1000`).
  - Exponent 3 (e.g., KWD, BHD, OMR): Multiplier = 1000 (1.250 KWD -> `1250`).
- Mathematical operations (sum, delta, subtraction) execute purely using integer arithmetic.
- Display formatting is handled via:
  ```javascript
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(integerAmount / multiplier)
  ```

---

## 3. Internal Account Transfers (Single-Record Model)
- An internal transfer represents moving funds between two accounts owned by the user.
- **Single Record**: Represented as a single transaction row:
  - `type = 'transfer'`
  - `account_id = source_account_id`
  - `destination_account_id = destination_account_id`
  - `amount = positive_integer`
- **Accounting Invariants**:
  - A transfer is **NEVER** classified as an Income or Expense.
  - A transfer does **NOT** alter Net Financial Position or Monthly Cash Flow.
  - Source account balance is reduced by `amount`.
  - Destination account balance is increased by `amount`.
  - Net effect on total liquid funds: **0**.

---

## 4. Credit Card Liabilities & Debt Semantics
- A Credit Card is an account of type `'credit_card'`.
- Purchases made using a credit card:
  - Logged as `type = 'expense'` with `account_id = credit_card_id`.
  - Increases the credit card's outstanding liability (amount owed).
- **Paying Credit Card Bills / Settlements**:
  - Logged as an **Internal Transfer**:
    - `account_id` = Cash or Bank Account (Source).
    - `destination_account_id` = Credit Card Account (Destination).
  - **Critical Rule**: This payment is **NOT** a new expense, because the underlying purchases were already recorded as expenses at the time of purchase. Recording it as an expense would double-count the expenditure.
  - Effect: Decreases bank cash and decreases credit card debt liability.

---

## 5. Distinction Between Financial Metrics
The application enforces strict separation between asset and liability metrics:

1. **Available Funds (Liquid Assets)**:
   $$\text{Available Funds} = \sum \text{Positive balances in (Cash, Bank, Digital Wallets)}$$
2. **Total Liabilities (Debt Owed)**:
   $$\text{Total Liabilities} = \sum \text{Outstanding balances owed on Credit Cards}$$
3. **Net Financial Position**:
   $$\text{Net Position} = \text{Available Funds} - \text{Total Liabilities}$$
4. **Net Cash Flow (Monthly Period)**:
   $$\text{Net Cash Flow} = \sum_{\text{Period}} \text{Income} - \sum_{\text{Period}} \text{Expense}$$
   *(Note: Transfers are completely excluded from Cash Flow calculations).*

---

## 6. Currency Modification Policy
- The MVP supports exactly one base currency per dataset.
- The currency can be selected on initialization.
- **Locking Policy**: Once transactions or non-zero account balances exist, the currency selector is **permanently locked** against direct modification.
- Changing currency symbol without real exchange rate calculation is strictly forbidden to prevent misleading financial records.
