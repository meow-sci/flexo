---
title: "Rules"
---

# Rules

The progress of all rule implementations is tracked [here](https://github.com/oxc-project/oxc/issues/481).

- Total number of rules: run `oxlint --rules` to see the current count
- Rules turned on by default: run `oxlint --rules` to see the current count
- Rules with fixes available: see the Fix column in individual rule files

**Legend for 'Fixable?' column**

- 🛠️: an auto-fix is available for this rule
- 💡: a suggestion is available for this rule
- ⚠️🛠️: a dangerous auto-fix is available for this rule
- ⚠️💡: a dangerous suggestion is available for this rule
- 🚧: an auto-fix or suggestion is possible, but currently not implemented


---

See the individual rule files in the `rules/` subdirectories organised by plugin:

| Plugin | Description |
|--------|-------------|
| [eslint](./rules/eslint/) | Core JavaScript rules |
| [typescript](./rules/typescript/) | TypeScript-specific rules |
| [react](./rules/react/) | React rules |
| [import](./rules/import/) | import/export rules |
| [jest](./rules/jest/) | Jest testing rules |
| [vitest](./rules/vitest/) | Vitest testing rules |
| [jsdoc](./rules/jsdoc/) | JSDoc comment rules |
| [jsx_a11y](./rules/jsx_a11y/) | JSX accessibility rules |
| [nextjs](./rules/nextjs/) | Next.js rules |
| [node](./rules/node/) | Node.js rules |
| [oxc](./rules/oxc/) | Oxc-specific rules |
| [promise](./rules/promise/) | Promise/async rules |
| [react_perf](./rules/react_perf/) | React performance rules |
| [unicorn](./rules/unicorn/) | Unicorn opinionated rules |
| [vue](./rules/vue/) | Vue.js rules |
