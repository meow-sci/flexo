---
title: "typescript/no-invalid-void-type"
rule: "typescript/no-invalid-void-type"
category: "Restriction"
version: "1.47.0"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-invalid-void-type/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `void` type usage outside return types and configured generic contexts.

### Why is this bad?

In TypeScript, `void` is primarily meaningful in return positions. Using `void` in other
type locations (parameters, properties, aliases, and most unions) is usually confusing and
often indicates a mistaken type design.

### Examples

Examples of **incorrect** code for this rule:

```ts
function takeVoid(arg: void) {}
type Alias = void;
type Union = string | void;
```

Examples of **correct** code for this rule:

```ts
function f(): void {}
type P = Promise<void>;
type U = void | never;
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowAsThisParameter

type: `boolean`

default: `false`

Whether a `this` parameter of a function may be `void`.

### allowInGenericTypeArguments

type: `array | boolean`

#### allowInGenericTypeArguments[n]

type: `string`

## How to use

```json
{
  "rules": {
    "typescript/no-invalid-void-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-invalid-void-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.47.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-invalid-void-type/)
