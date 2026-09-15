---
title: "eslint/getter-return"
rule: "eslint/getter-return"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/getter-return"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Requires all getters to have a `return` statement.

### Why is this bad?

Getters should always return a value. If they don't, it's probably a mistake.

This rule does not run on TypeScript files, since type checking will
catch getters that do not return a value.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class Person {
  get name() {
    // no return
  }
}

const obj = {
  get foo() {
    // object getter are also checked
  },
};
```

Examples of **correct** code for this rule:

```javascript
class Person {
  get name() {
    return this._name;
  }
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowImplicit

type: `boolean`

default: `false`

When set to `true`, allows getters to implicitly return `undefined` with a `return` statement containing no expression.

## How to use

```json
{
  "rules": {
    "eslint/getter-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/getter-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/getter-return)
