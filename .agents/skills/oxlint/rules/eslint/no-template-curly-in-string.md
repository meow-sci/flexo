---
title: "eslint/no-template-curly-in-string"
rule: "eslint/no-template-curly-in-string"
category: "Style"
version: "0.2.14"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-template-curly-in-string"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow template literal placeholder syntax in regular strings. This rule ensures that
expressions like `${variable}` are only used within template literals, avoiding incorrect
usage in regular strings.

### Why is this bad?

ECMAScript 6 allows programmers to create strings containing variables or expressions using
template literals. This is done by embedding expressions like `${variable}` between backticks.
If regular quotes (`'` or `"`) are used with template literal syntax, it results in the literal
string `"${variable}"` instead of evaluating the expression. This rule helps to avoid this mistake,
ensuring that expressions are correctly evaluated inside template literals.

### Examples

Examples of **incorrect** code for this rule:

```javascript
"Hello ${name}!";
"Hello ${name}!";
"Time: ${12 * 60 * 60 * 1000}";
```

Examples of **correct** code for this rule:

```javascript
`Hello ${name}!`;
`Time: ${12 * 60 * 60 * 1000}`;
templateFunction`Hello ${name}`;
```

## How to use

```json
{
  "rules": {
    "eslint/no-template-curly-in-string": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-template-curly-in-string": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-template-curly-in-string)
