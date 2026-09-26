---
title: "react/jsx-no-undef"
rule: "react/jsx-no-undef"
category: "Correctness"
version: "0.1.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-undef.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow undeclared variables in JSX.

Note that this rule is generally unnecessary if you are using TypeScript, as
TypeScript will catch undeclared variables for you.

### Why is this bad?

It is most likely a potential ReferenceError caused by a misspelling of a variable or parameter name.

### Examples

Examples of **incorrect** code for this rule:

```jsx
const A = () => <App />;
const C = <B />;
```

## How to use

```json
{
  "rules": {
    "react/jsx-no-undef": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/jsx-no-undef": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-undef.md)
