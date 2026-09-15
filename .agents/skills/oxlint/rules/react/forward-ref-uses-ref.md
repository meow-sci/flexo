---
title: "react/forward-ref-uses-ref"
rule: "react/forward-ref-uses-ref"
category: "Correctness"
version: "0.16.9"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/forward-ref-uses-ref.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Requires that components wrapped with `forwardRef` must have a `ref` parameter.
Omitting the `ref` argument is usually a bug,
and components not using `ref` don't need to be wrapped by `forwardRef`.

### Why is this bad?

Omitting the `ref` argument makes the `forwardRef` wrapper unnecessary,
and can lead to confusion.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var React = require("react");

var Component = React.forwardRef((props) => <div />);
```

Examples of **correct** code for this rule:

```jsx
var React = require("react");

var Component = React.forwardRef((props, ref) => <div ref={ref} />);

var Component = React.forwardRef((props, ref) => <div />);

function Component(props) {
  return <div />;
}
```

## How to use

```json
{
  "rules": {
    "react/forward-ref-uses-ref": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/forward-ref-uses-ref": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.9.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/forward-ref-uses-ref.md)
