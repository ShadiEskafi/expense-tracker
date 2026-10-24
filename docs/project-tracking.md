# Project Tracking: Harness Engineering & Trello Integration

> **Status**: Active Operational Specification  
> **Authoritative Source of Truth**: [feature_list.json](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/feature_list.json) & [progress.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/progress.md)  
> **Visual Tracking Mirror**: Trello Project Board (`Expense Management App — Harness Board`)

---

## 1. Architectural Philosophy & Source of Truth

The repository code and Harness state files remain the sole engineering source of truth. Trello serves strictly as a **visual project tracking layer** to provide real-time stakeholder visibility into progress, active WIP, and dependency sequencing.

```text
feature_list.json (Execution Truth)
         ↓
       Trello      (Visual Mirror)
```

### Inviolable Rules
1. **Repository Authority**: `feature_list.json` is always authoritative. Trello reflects the Harness state, never replaces it.
2. **Directional Flow**: Never modify a feature's state in Trello without first committing that transition in the Harness state files.
3. **Reconciliation**: If any discrepancy occurs between Trello and `feature_list.json`, Trello must be immediately reconciled to mirror `feature_list.json`.
4. **WIP=1 Enforced**: The `In Progress` list must never contain more than 1 feature card at any time (`In Progress <= 1`).

---

## 2. Core Lists & State Mapping

The Trello board contains exactly 5 core lists corresponding to the Harness lifecycle:

| Trello List | Harness Criteria | Description |
|---|---|---|
| **Backlog** | `state = not-started` AND dependencies incomplete | Features defined in `feature_list.json` whose prerequisites have not yet reached `passing`. |
| **Ready** | `state = not-started` AND dependencies satisfied | Features whose required prerequisites are all `passing`. Eligible for selection. |
| **In Progress** | `state = active` (strictly $\le 1$ card) | The single active feature undergoing implementation and verification under WIP=1. |
| **Blocked** | `state = blocked` | Features blocked by external or environmental issues. |
| **Done** | `state = passing` with automated test evidence | Features fully verified with passing automated tests, recorded evidence, and atomic git commit. |

> [!NOTE]
> No separate "Testing" list is used. Automated verification is part of the active feature lifecycle before moving directly to `Done`.

---

## 3. Card Structure & Content Standards

Every feature in `feature_list.json` has a 1:1 corresponding Trello card.

### Card Title Format
```text
[Feature ID] Feature Name
```
*Example*: `[F003] Deterministic Category Pre-seeding`

### Card Description Schema
```markdown
### Feature ID
F003

### Behavior
Pre-populates default expense and income categories with fixed system slugs (e.g. cat_food, cat_salary) to prevent duplication during cloud sync.

### Verification
npm test src/services/category.test.js

### Harness State
passing

### Dependencies
- F001

### Evidence
All 19 unit tests passed in src/services/category.test.js (145ms), verifying 16 deterministic default categories...

### Commit
0a7cc8a

### Completion Date
2026-10-24
```

### Card Completion Checklists
Each card contains 3 lightweight verification checklists:

#### 1. Implementation
- [ ] Feature implemented

#### 2. Verification
- [ ] Feature verification passed
- [ ] Relevant tests passed
- [ ] Typecheck passed
- [ ] Lint passed
- [ ] Build passed

#### 3. Harness State
- [ ] `feature_list.json` updated
- [ ] `progress.md` updated
- [ ] Relevant docs updated
- [ ] Atomic commit created

---

## 4. Label Taxonomy

A concise 2-tier label system is enforced:

### Classification
- **MVP** (Black / Charcoal): Applied to all 20 MVP features in `feature_list.json`. (Future enhancements are deferred and omitted from active board).

### Domain Subsystem
- **Foundation** (Purple): Database clients, layout shells, build pipelines.
- **Data** (Blue): Data models, pre-seeding, IndexedDB queries, backups.
- **Financial Logic** (Green): Currency precision, balance calculation, credit liability algebra.
- **UI/UX** (Orange): RTL design system, quick add form, ledger view, analytics widgets.
- **Sync** (Sky): Mutation queue, OCC concurrency, Supabase cloud sync.
- **PWA** (Yellow): Service worker caching, persistent storage API.
- **Security** (Red): Un-synced mutation blocking on sign-out, data privacy.
- **Testing** (Lime): Verification suites and test harness.

---

## 5. Feature Dependency Matrix

The authoritative dependency ordering across all 20 MVP features:

| ID | Feature Name | Dependencies | Initial Trello List |
|---|---|---|---|
| **F001** | Local-First IndexedDB Schema & Database Client | None | **Done** |
| **F002** | Monetary Precision & ISO 4217 Minor Units Engine | None | **Done** |
| **F003** | Deterministic Category Pre-seeding | F001 | **Done** |
| **F004** | Account Management & Ledger-Backed Balance Service | F001, F002 | **Ready** |
| **F005** | Expense & Income Transaction CRUD | F001, F002, F003, F004 | **Backlog** |
| **F006** | Internal Account Transfer (Single-Record Model) | F004, F005 | **Backlog** |
| **F007** | Credit Card Liability & Financial Position Metrics | F004, F005, F006 | **Backlog** |
| **F008** | Arabic-First & RTL Design System Layout Shell | F001, F004 | **Backlog** |
| **F009** | Quick Add Transaction Flow (<5s Target) | F005, F008 | **Backlog** |
| **F010** | Dashboard Financial Overview & Analytics Widgets | F007, F008 | **Backlog** |
| **F011** | Transaction Ledger, Keyword Search & Multi-Filtering | F005, F008 | **Backlog** |
| **F012** | Periodic Reports & Analytics View | F010, F011 | **Backlog** |
| **F013** | Categories Management View | F003, F005, F008 | **Backlog** |
| **F014** | Currency Configuration & Immutability Lock | F002, F004, F005 | **Backlog** |
| **F015** | CSV Export Engine | F005, F011 | **Backlog** |
| **F016** | Atomic JSON Backup & Restore Pipeline | F001, F003, F004, F005 | **Backlog** |
| **F017** | Offline Mutation Queue & Concurrency Engine (OCC) | F001, F005 | **Backlog** |
| **F018** | Supabase Cloud Sync & Initial Account Merge | F003, F017 | **Backlog** |
| **F019** | Fail-Safe Sign-Out with Un-Synced Mutation Blocking | F016, F017, F018 | **Backlog** |
| **F020** | PWA Offline Caching & Storage Persistence | F001, F008 | **Backlog** |

---

## 6. Future Session Protocol

Whenever an agent or developer transitions a feature, follow this exact sequence:

1. **Selecting Feature**:
   - Verify all dependencies in `feature_list.json` are `passing`.
   - Update `feature_list.json`: `state: "active"`.
   - Update Trello card: Move from `Ready` to `In Progress` (confirm `In Progress <= 1`).

2. **Completing Feature**:
   - Execute verification command and full test suite (`npm test`).
   - Run linter and build (`npm run lint && npm run build`).
   - Update `feature_list.json`: `state: "passing"` with full `evidence`.
   - Update `progress.md`.
   - Record atomic git commit.
   - Update Trello card:
     - Check all checklist items.
     - Move card from `In Progress` to `Done`.
     - Update card description with commit hash and completion date.

3. **Releasing Next Dependencies**:
   - Check if subsequent features in `feature_list.json` now have all dependencies satisfied.
   - For any eligible features, move their card from `Backlog` to `Ready`.

4. **Handling Blockers**:
   - If a feature is blocked, update `feature_list.json`: `state: "blocked"`.
   - Move card to `Blocked` with a comment explaining the blocker.

---

## 7. Synchronization Tooling

A lightweight Node.js synchronization CLI script is provided in `scripts/trello-sync.js`.

### Running Sync
```bash
npm run trello:sync
```

### Environment Variables (.env)
```env
TRELLO_API_KEY=your_trello_api_key
TRELLO_TOKEN=your_trello_token
TRELLO_BOARD_ID=optional_existing_board_id
```

When credentials are configured, the script automatically verifies/creates the board, creates missing lists, and syncs all cards with checklists and labels. When run without credentials or with `--dry-run`, it performs an offline audit validating the 1:1 mapping, dependency satisfaction, and WIP=1 constraint.
