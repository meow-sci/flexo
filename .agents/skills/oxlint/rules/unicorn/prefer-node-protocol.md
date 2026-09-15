---
title: "unicorn/prefer-node-protocol"
rule: "unicorn/prefer-node-protocol"
category: "Restriction"
version: "0.0.19"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-node-protocol.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer using the `node:protocol` when importing Node.js builtin modules.

### Why is this bad?

Node.js builtin modules should be imported using the `node:` protocol to avoid ambiguity with local modules.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import fs from "fs";
```

Examples of **correct** code for this rule:

```javascript
import fs from "node:fs";
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-node-protocol": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-node-protocol": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-node-protocol.md)
