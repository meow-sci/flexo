---
title: "eslint/no-void"
rule: "eslint/no-void"
category: "Restriction"
version: "0.2.5"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-void"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows the use of the `void` operator.

### Why is this bad?

The `void` operator is often used to get `undefined`, but this is
unnecessary because `undefined` can be used directly instead.

### Examples

Examples of **incorrect** code for this rule:

```ts
void 0;
var foo = void 0;
```

Examples of **correct** code for this rule:

```ts
"var foo = bar()";
"foo.void()";
"foo.void = bar";
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowAsStatement

type: `boolean`

default: `false`

If set to `true`, using `void` as a standalone statement is allowed.

## How to use

```json
{
  "rules": {
    "eslint/no-void": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-void": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-void)
