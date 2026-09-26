---
title: "promise/spec-only"
rule: "promise/spec-only"
category: "Restriction"
version: "0.9.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/spec-only.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow use of non-standard Promise static methods.

### Why is this bad?

Non-standard Promises may cost more maintenance work.

### Examples

Examples of **incorrect** code for this rule:

```js
Promise.done();
```

Examples of **correct** code for this rule:

```js
Promise.resolve();
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowedMethods

type: `string[]`

default: `null`

List of Promise static methods that are allowed to be used.

## How to use

```json
{
  "rules": {
    "promise/spec-only": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/spec-only": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.2.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/spec-only.md)
