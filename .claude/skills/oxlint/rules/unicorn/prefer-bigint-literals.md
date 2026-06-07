---
title: "unicorn/prefer-bigint-literals"
rule: "unicorn/prefer-bigint-literals"
category: "Style"
version: "1.30.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-bigint-literals.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Requires using BigInt literals (e.g. `123n`) instead of calling the `BigInt()` constructor
with literal arguments such as numbers or numeric strings

### Why is this bad?

Using `BigInt(…)` with literal values is unnecessarily verbose and less idiomatic than using
a BigInt literal.

### Examples

Examples of **incorrect** code for this rule:

```js
BigInt(0);
BigInt(123);
BigInt(0xff);
BigInt(1e3);
BigInt("42");
BigInt("0x10");
```

Examples of **correct** code for this rule:

```js
0n;
123n;
0xffn;
1000n;
// Non-integer, dynamic, or non-literal input:
BigInt(x);
BigInt("not-a-number");
BigInt("1.23");
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-bigint-literals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-bigint-literals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.30.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-bigint-literals.md)
