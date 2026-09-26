---
title: "oxc/bad-object-literal-comparison"
rule: "oxc/bad-object-literal-comparison"
category: "Correctness"
version: "0.1.1"
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

Checks for comparisons between object and array literals.

### Why is this bad?

Comparing a variable to an object or array literal will always return false as object and array literals are never equal to each other.

If you want to check if an object or array is empty, use `Object.entries()` or `Object.keys()` and their lengths.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (x === {}) {
}
if (arr !== []) {
}
```

Examples of **correct** code for this rule:

```javascript
if (typeof x === "object" && Object.keys(x).length === 0) {
}
if (Array.isArray(x) && x.length === 0) {
}
```

## How to use

```json
{
  "rules": {
    "oxc/bad-object-literal-comparison": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/bad-object-literal-comparison": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

