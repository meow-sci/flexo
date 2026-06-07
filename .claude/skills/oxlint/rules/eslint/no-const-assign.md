---
title: "eslint/no-const-assign"
rule: "eslint/no-const-assign"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-const-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow reassigning `const` variables.

### Why is this bad?

We cannot modify variables that are declared using the `const` keyword,
as it will raise a runtime error.

Note that this rule is not necessary for TypeScript
code, as TypeScript will already catch this as an error.

### Examples

Examples of **incorrect** code for this rule:

```js
const a = 0;
a = 1;

const b = 0;
b += 1;
```

Examples of **correct** code for this rule:

```js
const a = 0;
console.log(a);

var b = 0;
b += 1;
```

## How to use

```json
{
  "rules": {
    "eslint/no-const-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-const-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-const-assign)
