---
title: "oxc/no-const-enum"
rule: "oxc/no-const-enum"
category: "Restriction"
version: "0.4.2"
default: false
type_aware: false
fix: "fixable_fix"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow TypeScript `const enum`

### Why is this bad?

Const enums are enums that should be inlined at use sites.
Const enums are not supported by bundlers and are incompatible with the isolatedModules mode.
Their use can lead to import nonexistent values (because const enums are erased).

### Examples

Examples of **incorrect** code for this rule:

```ts
const enum Color {
  Red,
  Green,
  Blue,
}
```

## How to use

```json
{
  "rules": {
    "oxc/no-const-enum": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/no-const-enum": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

