---
title: "eslint/no-constructor-return"
rule: "eslint/no-constructor-return"
category: "Pedantic"
version: "0.4.3"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-constructor-return"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow returning value from constructor.

### Why is this bad?

In JavaScript, returning a value in the constructor of a class may be a mistake.
Forbidding this pattern prevents mistakes resulting from unfamiliarity with the language or a copy-paste error.

### Examples

Examples of **incorrect** code for this rule:

```js
class C {
  constructor() {
    return 42;
  }
}
```

Examples of **correct** code for this rule:

```js
class C {
  constructor() {
    this.value = 42;
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-constructor-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-constructor-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-constructor-return)
