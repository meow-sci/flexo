---
title: "unicorn/consistent-date-clone"
rule: "unicorn/consistent-date-clone"
category: "Style"
version: "0.15.13"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-date-clone.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

The Date constructor can clone a `Date` object directly when passed as an argument,
making timestamp conversion unnecessary. This rule enforces the use of the
direct `Date` cloning instead of using `.getTime()` for conversion.

### Why is this bad?

Using `.getTime()` to convert a `Date` object to a timestamp and then back to a
`Date` is redundant and unnecessary. Simply passing the `Date` object to the
`Date` constructor is cleaner and more efficient.

### Examples

Examples of **incorrect** code for this rule:

```js
new Date(date.getTime());
```

Examples of **correct** code for this rule:

```js
new Date(date);
```

## How to use

```json
{
  "rules": {
    "unicorn/consistent-date-clone": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/consistent-date-clone": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.13.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-date-clone.md)
