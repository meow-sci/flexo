---
title: "unicorn/require-number-to-fixed-digits-argument"
rule: "unicorn/require-number-to-fixed-digits-argument"
category: "Pedantic"
version: "0.0.15"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-number-to-fixed-digits-argument.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce using the digits argument with `Number#toFixed()`.

### Why is this bad?

It's better to make it clear what the value of the digits argument is when calling `Number#toFixed()`,
instead of relying on the default value of `0`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
number.toFixed();
```

Examples of **correct** code for this rule:

```javascript
number.toFixed(0);
number.toFixed(2);
```

## How to use

```json
{
  "rules": {
    "unicorn/require-number-to-fixed-digits-argument": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/require-number-to-fixed-digits-argument": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-number-to-fixed-digits-argument.md)
