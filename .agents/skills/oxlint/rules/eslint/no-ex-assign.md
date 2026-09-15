---
title: "eslint/no-ex-assign"
rule: "eslint/no-ex-assign"
category: "Correctness"
version: "0.0.4"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-ex-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow reassigning exceptions in catch clauses.

### Why is this bad?

If a catch clause in a try statement accidentally
(or purposely) assigns another value to the exception parameter,
it is impossible to refer to the error from that point on.
Since there is no arguments object to offer alternative access to this data,
assignment of the parameter is absolutely destructive.

### Examples

Examples of **incorrect** code for this rule:

```javascript
try {
  // code
} catch (e) {
  e = 10;
}
```

Examples of **correct** code for this rule:

```javascript
try {
  // code
} catch (e) {
  let val = 10;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-ex-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-ex-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-ex-assign)
