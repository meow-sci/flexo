---
title: "eslint/prefer-named-capture-group"
rule: "eslint/prefer-named-capture-group"
category: "Style"
version: "next"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/prefer-named-capture-group"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces the use of named capture groups in regular expressions.

### Why is this bad?

Unnamed capturing groups (`(...)`) are referenced only by position, which
makes the regex harder to read and maintain. When the pattern changes, index-based
references silently break. Named groups (`(?<name>...)`) make the intent explicit
and allow references by name (e.g. `match.groups.year`), which is more robust.

### Examples

Examples of **incorrect** code for this rule:

```js
const re = /([0-9]{4})-([0-9]{2})/;
const match = re.exec(str);
const year = match[1]; // fragile index
```

Examples of **correct** code for this rule:

```js
const re = /(?<year>[0-9]{4})-(?<month>[0-9]{2})/;
const match = re.exec(str);
const year = match.groups.year; // explicit name

// Non-capturing groups are always fine
const parts = /(?:[0-9]{4})/;
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-named-capture-group": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-named-capture-group": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in vnext.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-named-capture-group)
