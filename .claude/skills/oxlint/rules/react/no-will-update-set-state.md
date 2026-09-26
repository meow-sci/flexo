---
title: "react/no-will-update-set-state"
rule: "react/no-will-update-set-state"
category: "Correctness"
version: "1.37.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-will-update-set-state.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows using `setState` in the `componentWillUpdate` lifecycle method.

### Why is this bad?

Updating the state during the component update step can lead to indeterminate component state and is not allowed.
This can cause unexpected behavior and bugs in your React application.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  componentWillUpdate: function () {
    this.setState({
      name: this.props.name.toUpperCase(),
    });
  },
  render: function () {
    return <div>Hello {this.state.name}</div>;
  },
});
```

Examples of **correct** code for this rule:

```jsx
var Hello = createReactClass({
  componentWillUpdate: function () {
    this.props.prepareHandler();
  },
  render: function () {
    return <div>Hello {this.state.name}</div>;
  },
});
```

## Configuration

This rule accepts one of the following string values:

### `"allowed"`

Forbids any call to `this.setState` in `componentWillUpdate` outside of functions.

### `"disallow-in-func"`

Makes this rule more strict by disallowing calls to `this.setState`` even within functions.

## How to use

```json
{
  "rules": {
    "react/no-will-update-set-state": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-will-update-set-state": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.37.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-will-update-set-state.md)
