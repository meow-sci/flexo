---
title: "eslint/no-use-before-define"
rule: "eslint/no-use-before-define"
category: "Restriction"
version: "1.49.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-use-before-define"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows using variables before they are defined.

### Why is this bad?

Referencing identifiers before their declarations can hide bugs and
make code order-dependent and difficult to reason about.

### Examples

Examples of **incorrect** code for this rule:

```ts
new A();
var A = class {};
```

Examples of **correct** code for this rule:

```ts
var A = class {};
new A();
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowNamedExports

type: `boolean`

default: `false`

Allow named exports that appear before declaration.

### classes

type: `boolean`

default: `true`

Check class declarations.

### enums

type: `boolean`

default: `true`

Check enum declarations.

### functions

type: `boolean`

default: `true`

Check function declarations.

### ignoreTypeReferences

type: `boolean`

default: `true`

Ignore usages that are type-only references.

### typedefs

type: `boolean`

default: `true`

Check type aliases, interfaces, and type parameters.

### variables

type: `boolean`

default: `true`

Check variable declarations.

## How to use

```json
{
  "rules": {
    "eslint/no-use-before-define": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-use-before-define": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-use-before-define)
