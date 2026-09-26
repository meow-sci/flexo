---
title: "eslint/preserve-caught-error"
rule: "eslint/preserve-caught-error"
category: "Suspicious"
version: "1.16.0"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/preserve-caught-error"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforces that when re-throwing an error in a catch block, the original error
is preserved using the 'cause' property.

### Why is this bad?

Re-throwing an error without preserving the original error loses important
debugging information and makes it harder to trace the root cause of issues.

### Examples

Examples of **incorrect** code for this rule:

```js
try {
  doSomething();
} catch (err) {
  throw new Error("Something failed");
}
```

Examples of **correct** code for this rule:

```js
try {
  doSomething();
} catch (err) {
  throw new Error("Something failed", { cause: err });
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### requireCatchParameter

type: `boolean`

default: `false`

When set to `true`, requires that catch clauses always have a parameter.

## How to use

```json
{
  "rules": {
    "eslint/preserve-caught-error": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/preserve-caught-error": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.16.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/preserve-caught-error)
