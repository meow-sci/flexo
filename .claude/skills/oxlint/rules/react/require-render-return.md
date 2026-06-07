---
title: "react/require-render-return"
rule: "react/require-render-return"
category: "Nursery"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/require-render-return.md"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce ES5 or ES2015 class for returning value in the `render` function.

This rule is not relevant for function components, and so can potentially be
disabled for modern React codebases.

### Why is this bad?

When writing the `render` method in a component it is easy to forget to return the
JSX content. This rule will warn if the `return` statement is missing.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  render() {
    <div>Hello</div>;
  },
});

class Hello extends React.Component {
  render() {
    <div>Hello</div>;
  }
}
```

Examples of **correct** code for this rule:

```jsx
var Hello = createReactClass({
  render() {
    return <div>Hello</div>;
  },
});

class Hello extends React.Component {
  render() {
    return <div>Hello</div>;
  }
}
```

## How to use

```json
{
  "rules": {
    "react/require-render-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/require-render-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/require-render-return.md)
