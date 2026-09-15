---
title: "unicorn/number-literal-case"
rule: "unicorn/number-literal-case"
category: "Style"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/number-literal-case.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule enforces proper case for numeric literals.

### Why is this bad?

When both an identifier and a numeric literal are in
lower case, it can be hard to differentiate between them.

### Examples

Examples of **incorrect** code for this rule:

<!-- prettier-ignore-start -->
```javascript
const foo = 0XFF;
const foo = 0xff;
const foo = 0Xff;
const foo = 0Xffn;

const foo = 0B10;
const foo = 0B10n;

const foo = 0O76;
const foo = 0O76n;

const foo = 2E-5;
```

Examples of **correct** code for this rule:
```javascript
const foo = 0xFF;
const foo = 0b10;
const foo = 0o76;
const foo = 0xFFn;
const foo = 2e+5;
```
<!-- prettier-ignore-end -->

## How to use

```json
{
  "rules": {
    "unicorn/number-literal-case": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/number-literal-case": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/number-literal-case.md)
