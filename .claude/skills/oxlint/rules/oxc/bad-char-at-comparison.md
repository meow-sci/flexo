---
title: "oxc/bad-char-at-comparison"
rule: "oxc/bad-char-at-comparison"
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

This rule warns when the return value of the `charAt` method is used to compare a string of length greater than 1.

### Why is this bad?

The `charAt` method returns a string of length 1. If the return value is compared with a string of length greater than 1, the comparison will always be false.

### Examples

Examples of **incorrect** code for this rule:

```javascript
a.charAt(4) === "a2";
a.charAt(4) === "/n";
```

Examples of **correct** code for this rule:

```javascript
a.charAt(4) === "a";
a.charAt(4) === "\n";
```

## How to use

```json
{
  "rules": {
    "oxc/bad-char-at-comparison": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/bad-char-at-comparison": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.22.

## References

