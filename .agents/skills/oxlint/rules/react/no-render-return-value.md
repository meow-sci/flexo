---
title: "react/no-render-return-value"
rule: "react/no-render-return-value"
category: "Correctness"
version: "0.0.15"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-render-return-value.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule will warn you if you try to use the `ReactDOM.render()` return value.

### Why is this bad?

Using the return value from `ReactDOM.render()` is a legacy
feature and should not be used.

Note that `ReactDOM.render`
[has been removed entirely in React 19](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#removed-reactdom-render)
and so should generally not be used.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var inst = ReactDOM.render(<App />, document.body);
function render() {
  return ReactDOM.render(<App />, document.body);
}
```

Examples of **correct** code for this rule:

```jsx
ReactDOM.render(<App />, document.body);
```

## How to use

```json
{
  "rules": {
    "react/no-render-return-value": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-render-return-value": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-render-return-value.md)
