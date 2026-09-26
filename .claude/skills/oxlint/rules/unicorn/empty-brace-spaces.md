---
title: "unicorn/empty-brace-spaces"
rule: "unicorn/empty-brace-spaces"
category: "Style"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/empty-brace-spaces.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Removes the extra spaces or new line characters inside a pair of braces
that does not contain additional code. This ensures that braces are clean
and do not contain unnecessary spaces or newlines.

### Why is this bad?

Extra spaces inside braces can negatively impact the readability of the code.
Keeping braces clean and free of unnecessary characters improves consistency and
makes the code easier to understand and maintain.

### Examples

<!-- prettier-ignore-start -->
Examples of **incorrect** code for this rule:
```javascript
const a = {  };
class A {
}
```

<!-- prettier-ignore-end -->

Examples of **correct** code for this rule:

```javascript
const a = {};
class A {}
```

## How to use

```json
{
  "rules": {
    "unicorn/empty-brace-spaces": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/empty-brace-spaces": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/empty-brace-spaces.md)
