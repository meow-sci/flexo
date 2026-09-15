---
title: "unicorn/prefer-logical-operator-over-ternary"
rule: "unicorn/prefer-logical-operator-over-ternary"
category: "Style"
version: "0.0.15"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-logical-operator-over-ternary.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

This rule finds ternary expressions that can be simplified to a logical operator.

### Why is this bad?

Using a logical operator is shorter and simpler than a ternary expression.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = bar ? bar : baz;
console.log(foo ? foo : bar);
```

Examples of **correct** code for this rule:

```javascript
const foo = bar || baz;
console.log(foo ?? bar);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-logical-operator-over-ternary": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-logical-operator-over-ternary": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-logical-operator-over-ternary.md)
