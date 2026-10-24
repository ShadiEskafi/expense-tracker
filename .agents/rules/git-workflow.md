# Git Workflow & Commit Guidelines

## Commit Message Format
Follow Conventional Commits:
`<type>(<optional scope>): <description>`

Common types:
- `feat`: New feature or user-facing addition
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `style`: Formatting, CSS, markup polishing without logic change
- `docs`: Documentation updates or additions
- `test`: Adding or correcting tests
- `chore`: Tooling, build config, dependency updates

Examples:
- `feat(expenses): add category filter dropdown`
- `fix(calculator): prevent negative balance submission`
- `style(theme): add dark mode color variables`

## Branching Strategy
- `main`: Production-ready, stable codebase.
- `feature/<feature-name>`: New feature work.
- `fix/<bug-description>`: Bug fixes and patches.

## Pre-Commit Checklist
1. Run `npm run lint` - ensure zero errors and warnings.
2. Run `npm run build` - verify production build bundles cleanly.
3. Verify no debug artifacts or temporary test files are staged.
