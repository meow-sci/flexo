---
title: "oxc/bad-replace-all-arg"
rule: "oxc/bad-replace-all-arg"
category: "Correctness"
version: "0.0.22"
default: true
type_aware: false
fix: "none"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

This rule warns when the `replaceAll` method is called with a regular expression that does not have the global flag (g).

### Why is this bad?

The `replaceAll` method replaces all occurrences of a string with another string. If the global flag (g) is not used in the regular expression, only the first occurrence of the string will be replaced.

### Examples

Examples of **incorrect** code for this rule:

```javascript
withSpaces.replaceAll(/\s+/, ",");
```

Examples of **correct** code for this rule:

```javascript
withSpaces.replaceAll(/\s+/g, ",");
```

## How to use

```json
{
  "rules": {
    "oxc/bad-replace-all-arg": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/bad-replace-all-arg": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.22.

## References

