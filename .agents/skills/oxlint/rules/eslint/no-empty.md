---
title: "eslint/no-empty"
rule: "eslint/no-empty"
category: "Restriction"
version: "0.0.3"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-empty"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows empty block statements.

### Why is this bad?

Empty block statements, while not technically errors, usually occur due to refactoring that wasn’t completed.
They can cause confusion when reading code.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (condition) {
}
```

Examples of **correct** code for this rule:

```javascript
if (condition) {
  throw new Error("condition should be false");
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowEmptyCatch

type: `boolean`

default: `false`

If set to `true`, allows an empty `catch` block without triggering the linter.

## How to use

```json
{
  "rules": {
    "eslint/no-empty": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-empty": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-empty)
