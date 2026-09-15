---
title: "unicorn/no-useless-switch-case"
rule: "unicorn/no-useless-switch-case"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-switch-case.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallows useless `default` cases in `switch` statements.

### Why is this bad?

An empty case before the last `default` case is useless, as the
`default` case will catch it regardless.

### Examples

Examples of **incorrect** code for this rule:

```javascript
switch (foo) {
  case 1:
  default:
    handleDefaultCase();
    break;
}
```

Examples of **correct** code for this rule:

```javascript
switch (foo) {
  case 1:
  case 2:
    handleCase1And2();
    break;
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-switch-case": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-switch-case": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-switch-case.md)
