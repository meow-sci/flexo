---
title: "typescript/strict-void-return"
rule: "typescript/strict-void-return"
category: "Pedantic"
version: "0.0.8"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/strict-void-return/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Disallow returning non-void values where a `void` return is expected.

### Why is this bad?

Returning values from `void` contexts can hide logic errors and make callback APIs
behave unexpectedly.

### Examples

Examples of **incorrect** code for this rule:

```ts
declare function run(cb: () => void): void;

run(() => "value");
run(async () => 123);
```

Examples of **correct** code for this rule:

```ts
declare function run(cb: () => void): void;

run(() => {
  doWork();
});

run(() => undefined);
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowReturnAny

type: `boolean`

default: `false`

Allow callbacks that return `any` in places that expect a `void` callback.

## How to use

```json
{
  "rules": {
    "typescript/strict-void-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/strict-void-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/strict-void-return/)
