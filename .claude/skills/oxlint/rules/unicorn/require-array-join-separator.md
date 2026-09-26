---
title: "unicorn/require-array-join-separator"
rule: "unicorn/require-array-join-separator"
category: "Style"
version: "0.0.19"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-array-join-separator.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforce using the separator argument with `Array#join()`.

### Why is this bad?

It's better to make it clear what the separator is when calling `Array#join()`,
instead of relying on the default comma (`','`) separator.

### Examples

Examples of **incorrect** code for this rule:

```javascript
foo.join();
```

Examples of **correct** code for this rule:

```javascript
foo.join(",");
```

## How to use

```json
{
  "rules": {
    "unicorn/require-array-join-separator": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/require-array-join-separator": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-array-join-separator.md)
