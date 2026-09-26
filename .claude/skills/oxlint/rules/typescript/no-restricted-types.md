---
title: "typescript/no-restricted-types"
rule: "typescript/no-restricted-types"
category: "Restriction"
version: "1.31.0"
default: false
type_aware: false
fix: "fixable_safe_fix_or_suggestion"
upstream: "https://typescript-eslint.io/rules/no-restricted-types/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

Disallow certain types from being used.

### Why is this bad?

Some built-in types have aliases, while some types are considered dangerous or harmful.
It's often a good idea to ban certain types to help with consistency and safety.

### Examples

Given `{ "types": { "Foo": { "message": "Use Bar instead", "fixWith": "Bar" } } }`:

Examples of **incorrect** code for this rule:

```ts
let value: Foo;
```

Examples of **correct** code for this rule:

```ts
let value: Bar;
```

Other examples of configuration option setups for this rule:

- Banning the `Foo` type with just a message, no fixes or suggestions:
  `{ "types": { "Foo": "Use `OtherType` instead." } }`

- Banning `Bar` type with suggestion:
  `{ "types": { "Bar": { "message": "Avoid using `Bar`.", "suggest": "BazQux" } } }`

- Banning `Object` type with a generic message:
  `{ "types": { "Object": true } }`

## Configuration

This rule accepts a configuration object with the following properties:

### types

type: `object`

default: `{}`

A mapping of type names to ban configurations.

## How to use

```json
{
  "rules": {
    "typescript/no-restricted-types": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-restricted-types": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.31.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-restricted-types/)
