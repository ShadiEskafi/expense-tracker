---
name: add-feature
description: Guide for scaffolding and implementing new domain features in the Expense Tracker application.
---

# Add Feature Workflow

Use this runbook when introducing a new feature module (e.g., Budgeting, Recurring Expenses, Analytics Charts, Export to CSV) into the Expense Tracker app.

## Steps

1. **Plan Architecture & Data Models**
   - Identify data entities, fields, and types.
   - Plan storage strategy (e.g., `localStorage` keys or state context).

2. **Scaffold Feature Folder**
   - Create `src/features/<feature-name>/`:
     - `components/` - Subcomponents specific to this feature
     - `hooks/` - Feature-specific state and side-effect hooks
     - `utils/` - Computation, filtering, or formatting logic
     - `index.js` (or primary export file)

3. **Implement UI & Interaction**
   - Ensure semantic HTML, accessible form inputs with labels, and keyboard navigation.
   - Connect inputs to validation logic and clear feedback states.

4. **Integration & Verification**
   - Mount feature in `src/App.jsx` or relevant layout container.
   - Run `npm run lint` to check for syntax or styling rule violations.
   - Run `npm run build` to verify production bundle integrity.
