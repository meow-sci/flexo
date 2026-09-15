---
title: "react/no-danger-with-children"
rule: "react/no-danger-with-children"
category: "Correctness"
version: "0.9.6"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-danger-with-children.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows when a DOM element is using both `children` and `dangerouslySetInnerHTML` properties.

### Why is this bad?

React will throw a warning if this rule is ignored and both `children` and `dangerouslySetInnerHTML` are used.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div dangerouslySetInnerHTML={{ __html: "HTML" }}>Children</div>;
React.createElement("div", { dangerouslySetInnerHTML: { __html: "HTML" } }, "Children");
```

Examples of **correct** code for this rule:

```jsx
<div>Children</div>
<div dangerouslySetInnerHTML={{ __html: "HTML" }} />
```

## How to use

```json
{
  "rules": {
    "react/no-danger-with-children": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-danger-with-children": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.6.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-danger-with-children.md)
