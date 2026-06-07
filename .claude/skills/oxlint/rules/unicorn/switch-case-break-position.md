---
title: "unicorn/switch-case-break-position"
rule: "unicorn/switch-case-break-position"
category: "Style"
version: "1.59.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/switch-case-break-position.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforce consistent `break`/`return`/`continue`/`throw` position in `case` clauses.

### Why is this bad?

Enforce that terminating statements (`break`, `return`, `continue`, `throw`) appear inside the block statement of a `case` clause, not after it.
This can happen when refactoring — for example, removing an `if` wrapper but leaving the `break` outside the braces.

### Examples

Examples of **incorrect** code for this rule:

```js
switch (foo) {
  case 1:
    {
      doStuff();
    }
    break;
}
```

Examples of **correct** code for this rule:

```js
switch (foo) {
  case 1: {
    doStuff();
    break;
  }
}
```

## How to use

```json
{
  "rules": {
    "unicorn/switch-case-break-position": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/switch-case-break-position": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/switch-case-break-position.md)
