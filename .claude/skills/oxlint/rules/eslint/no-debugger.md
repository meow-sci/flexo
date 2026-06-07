---
title: "eslint/no-debugger"
rule: "eslint/no-debugger"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-debugger"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Checks for usage of the `debugger` statement.

### Why is this bad?

`debugger` statements do not affect functionality when a debugger isn't attached.
They're most commonly an accidental debugging leftover.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function main() {
  const data = await getData();
  const result = complexCalculation(data);
  debugger;
}
```

Examples of **correct** code for this rule:

```javascript
async function main() {
  const data = await getData();
  const result = complexCalculation(data);
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-debugger": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-debugger": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-debugger)
