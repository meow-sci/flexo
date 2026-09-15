---
title: "react/no-namespace"
rule: "react/no-namespace"
category: "Suspicious"
version: "0.15.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-namespace.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that namespaces are not used in React elements.

### Why is this bad?

Namespaces in React elements, such as svg:circle, are not supported by React.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<ns:TestComponent />
<Ns:TestComponent />
```

Examples of **correct** code for this rule:

```jsx
<TestComponent />
<testComponent />
```

## How to use

```json
{
  "rules": {
    "react/no-namespace": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-namespace": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.13.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-namespace.md)
