---
title: "jsdoc/empty-tags"
rule: "jsdoc/empty-tags"
category: "Restriction"
version: "0.2.16"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/emptyTags.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Expects the following tags to be empty of any content:

- `@abstract`
- `@async`
- `@generator`
- `@global`
- `@hideconstructor`
- `@ignore`
- `@inner`
- `@instance`
- `@override`
- `@readonly`
- `@inheritDoc`
- `@internal`
- `@overload`
- `@package`
- `@private`
- `@protected`
- `@public`
- `@static`

### Why is this bad?

The void tags should be empty.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** @async foo */

/** @private bar */
```

Examples of **correct** code for this rule:

```javascript
/** @async */

/** @private */
```

## Configuration

This rule accepts a configuration object with the following properties:

### tags

type: `string[]`

default: `[]`

Additional tags to check for their descriptions.

## How to use

```json
{
  "rules": {
    "jsdoc/empty-tags": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/empty-tags": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.16.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/emptyTags.md)
