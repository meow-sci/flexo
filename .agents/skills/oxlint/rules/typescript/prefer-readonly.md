---
title: "typescript/prefer-readonly"
rule: "typescript/prefer-readonly"
category: "Style"
version: "0.0.8"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/prefer-readonly/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Require class members that are never reassigned to be marked `readonly`.

### Why is this bad?

Members that never change should be declared `readonly` to make class invariants explicit
and prevent accidental mutation.

### Examples

Examples of **incorrect** code for this rule:

```ts
class Counter {
  private value = 0;

  getValue() {
    return this.value;
  }
}
```

Examples of **correct** code for this rule:

```ts
class Counter {
  private readonly value = 0;

  getValue() {
    return this.value;
  }
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### onlyInlineLambdas

type: `boolean`

default: `false`

Restrict checks to members immediately initialized with inline lambda values.

## How to use

```json
{
  "rules": {
    "typescript/prefer-readonly": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-readonly": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-readonly/)
