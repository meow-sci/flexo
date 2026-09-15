---
title: "unicorn/no-magic-array-flat-depth"
rule: "unicorn/no-magic-array-flat-depth"
category: "Restriction"
version: "0.4.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-magic-array-flat-depth.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow magic numbers for [`Array.prototype.flat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat)
depth.

### Why is this bad?

Magic numbers are hard to understand and maintain.
When calling `Array.prototype.flat`, it is usually called with
`1` or `Infinity`. If you are using a different number, it is
better to add a comment explaining the reason for the depth provided.

### Examples

Examples of **incorrect** code for this rule:

```javascript
array.flat(2);
array.flat(20);
```

Examples of **correct** code for this rule:

```javascript
array.flat(2 /* explanation */);
array.flat(1);
array.flat();
array.flat(Infinity);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-magic-array-flat-depth": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-magic-array-flat-depth": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-magic-array-flat-depth.md)
