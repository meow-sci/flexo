---
title: "eslint/no-duplicate-case"
rule: "eslint/no-duplicate-case"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-duplicate-case"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow duplicate case labels.

### Why is this bad?

If a switch statement has duplicate test expressions in case clauses,
it is likely that a programmer copied a case clause but forgot to change the test expression.

### Examples

Examples of **incorrect** code for this rule:

```js
var a = 1,
  one = 1;
switch (a) {
  case 1:
    break;
  case 2:
    break;
  case 1: // duplicate test expression
    break;
  default:
    break;
}

switch (a) {
  case one:
    break;
  case 2:
    break;
  case one: // duplicate test expression
    break;
  default:
    break;
}
```

Examples of **correct** code for this rule:

```js
var a = 1,
  one = 1;
switch (a) {
  case 1:
    break;
  case 2:
    break;
  default:
    break;
}

switch (a) {
  case "1":
    break;
  case "2":
    break;
  default:
    break;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-duplicate-case": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-duplicate-case": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-duplicate-case)
