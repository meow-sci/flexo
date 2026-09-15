---
title: "unicorn/prefer-module"
rule: "unicorn/prefer-module"
category: "Restriction"
version: "1.50.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-module.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Prefer JavaScript modules (ESM) over CommonJS.

### Why is this bad?

CommonJS globals and patterns (`require`, `module`, `exports`, `__filename`, `__dirname`)
make code harder to migrate and can block ESM-only features.

### Examples

Examples of **incorrect** code for this rule:

```js
"use strict";
const foo = require("foo");
module.exports = foo;
```

Examples of **correct** code for this rule:

```js
import foo from "foo";
export default foo;
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-module": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-module": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.50.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-module.md)
