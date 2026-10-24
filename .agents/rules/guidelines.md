# Code & Architectural Guidelines

## 1. Project Organization
Structure code cleanly under `src/` as features are implemented:
```text
src/
├── assets/          # Static media and icons
├── components/      # Reusable UI components (Button, Modal, Card, Input)
├── features/        # Domain-specific modules (expenses, budget, analytics)
├── hooks/           # Custom React hooks (useLocalStorage, useExpenses)
├── context/         # React Context providers for global state
├── utils/           # Helper functions (currency formatting, date math, validation)
├── constants/       # App constants, category definitions, default configs
├── App.jsx          # Main application layout
├── main.jsx         # App bootstrap
└── index.css        # Global styles & design tokens
```

## 2. React 19 Standards
- **Functional Components**: Use standard functional components with named exports or clear default exports.
- **Hooks Rules**: Keep hooks at the top level of components; leverage built-in React 19 hooks where appropriate.
- **State Updates**: Always use immutable update patterns when modifying arrays or objects in state.
- **Derived State**: Compute values during render instead of duplicating them in state (e.g. calculate total balance from transactions).

## 3. Financial Data & Calculations
- **Currency Accuracy**: Avoid floating point precision errors for financial sums; calculate amounts in cents/integers or use dedicated numeric helpers.
- **Date Handling**: Store dates in ISO 8601 format (`YYYY-MM-DD` or UTC timestamp) and format for display using `Intl.DateTimeFormat`.
- **Localization**: Use `Intl.NumberFormat` for currency display based on the user's selected or default locale.

## 4. UI / UX & Accessibility (a11y)
- **Semantic HTML**: Use proper tags (`<header>`, `<main>`, `<section>`, `<form>`, `<button>`, `<dialog>`).
- **Form Controls**: Always connect form inputs with `<label htmlFor="...">`, provide validation feedback and clear error states.
- **Accessibility**: Ensure high-contrast color pairings, visible focus outlines, and keyboard navigability across all interactive elements.

## 5. Code Quality & Linting
- Run `npm run lint` before committing changes.
- Avoid leaving unused imports, dangling console logs, or ignored lint warnings.
- Keep components focused on a single responsibility; split complex UI into smaller subcomponents.
