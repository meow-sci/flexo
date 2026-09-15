---
title: "unicorn/no-null"
rule: "unicorn/no-null"
category: "Style"
version: "0.0.21"
default: false
type_aware: false
fix: "conditional_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-null.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | conditional_dangerous_fix |
| Type-aware | no |


### What it does

Disallow the use of the `null` literal, to encourage using `undefined` instead.

### Why is this bad?

There are some reasons for using `undefined` instead of `null`.

- From experience, most developers use `null` and `undefined` inconsistently and interchangeably, and few know when to use which.
- Supporting both `null` and `undefined` complicates input validation.
- Using `null` makes TypeScript types more verbose: `type A = {foo?: string | null}` vs `type A = {foo?: string}`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let foo = null;
```

Examples of **correct** code for this rule:

```javascript
let foo;
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkStrictEquality

type: `boolean`

default: `false`

When set to `true`, the rule will also check strict equality/inequality comparisons (`===` and `!==`) against `null`.

## How to use

```json
{
  "rules": {
    "unicorn/no-null": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-null": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.21.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-null.md)
