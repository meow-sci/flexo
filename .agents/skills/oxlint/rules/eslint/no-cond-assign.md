---
title: "eslint/no-cond-assign"
rule: "eslint/no-cond-assign"
category: "Correctness"
version: "0.0.5"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-cond-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow assignment operators in conditional expressions.

### Why is this bad?

In conditional statements, it is very easy to mistype a comparison
operator (such as `==`) as an assignment operator (such as `=`).

There are valid reasons to use assignment operators in conditional
statements. However, it can be difficult to tell whether a specific
assignment was intentional.

### Examples

Examples of **incorrect** code for this rule:

```js
// Check the user's job title
if ((user.jobTitle = "manager")) {
  // user.jobTitle is now incorrect
}
```

Examples of **correct** code for this rule:

```js
// Check the user's job title
if (user.jobTitle === "manager") {
  // correctly compared `jobTitle`
}
```

## Configuration

This rule accepts one of the following string values:

### `"except-parens"`

Allow assignments in conditional expressions only if they are
enclosed in parentheses.

### `"always"`

Disallow all assignments in conditional expressions.

## How to use

```json
{
  "rules": {
    "eslint/no-cond-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-cond-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-cond-assign)
