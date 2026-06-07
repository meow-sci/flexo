---
title: "eslint/no-global-assign"
rule: "eslint/no-global-assign"
category: "Correctness"
version: "0.0.7"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-global-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow modifications to read-only global variables.

### Why is this bad?

In almost all cases, you don't want to assign a value to these global variables as doing so could result in losing access to important functionality.

### Examples

Examples of **incorrect** code for this rule:

```javascript
Object = null;
```

## Configuration

This rule accepts a configuration object with the following properties:

### exceptions

type: `string[]`

default: `[]`

List of global variable names to exclude from this rule.
Globals listed here can be assigned to without triggering warnings.

## How to use

```json
{
  "rules": {
    "eslint/no-global-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-global-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-global-assign)
