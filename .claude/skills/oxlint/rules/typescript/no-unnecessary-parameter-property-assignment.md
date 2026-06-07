---
title: "typescript/no-unnecessary-parameter-property-assignment"
rule: "typescript/no-unnecessary-parameter-property-assignment"
category: "Correctness"
version: "0.15.13"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/no-unnecessary-parameter-property-assignment/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Prevents unnecessary assignment of parameter properties.

### Why is this bad?

Constructor parameters marked with one of the visibility modifiers
public, private, protected, or readonly are automatically initialized.
Providing an explicit assignment is unnecessary and can be removed.

### Examples

Examples of **incorrect** code for this rule:

```js
class Foo {
  constructor(public name: unknown) {
    this.name = name;
  }
}
```

Examples of **correct** code for this rule:

```js
class Foo {
  constructor(public name: unknown) {}
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-unnecessary-parameter-property-assignment": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unnecessary-parameter-property-assignment": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.13.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unnecessary-parameter-property-assignment/)
