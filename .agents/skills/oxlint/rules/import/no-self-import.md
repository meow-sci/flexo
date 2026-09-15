---
title: "import/no-self-import"
rule: "import/no-self-import"
category: "Suspicious"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-self-import.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Forbids a module from importing itself. This can sometimes happen accidentally,
especially during refactoring.

### Why is this bad?

Importing a module into itself creates a circular dependency, which can cause
runtime issues, including infinite loops, unresolved imports, or `undefined` values.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// foo.js
import foo from "./foo.js"; // Incorrect: module imports itself
const foo = require("./foo"); // Incorrect: module imports itself
```

Examples of **correct** code for this rule:

```javascript
// foo.js
import bar from "./bar.js"; // Correct: module imports another module
```

## How to use

```json
{
  "rules": {
    "import/no-self-import": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-self-import": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-self-import.md)
