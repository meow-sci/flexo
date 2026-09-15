---
title: "eslint/no-unreachable"
rule: "eslint/no-unreachable"
category: "Correctness"
version: "0.4.4"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-unreachable"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow unreachable code after `return`, `throw`, `continue`, and `break` statements.

This rule can be disabled for TypeScript code if `allowUnreachableCode: false` is configured
in the `tsconfig.json`, as the TypeScript compiler enforces this check.

### Why is this bad?

Unreachable code after a `return`, `throw`, `continue`, or `break` statement can never be run.

### Examples

Examples of **incorrect** code for this rule:

```ts
function foo() {
  return 2;
  console.log("this will never be executed");
}
```

Examples of **correct** code for this rule:

```ts
function foo() {
  console.log("this will be executed");
  return 2;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-unreachable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unreachable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unreachable)
