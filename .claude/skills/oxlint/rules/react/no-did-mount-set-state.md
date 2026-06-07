---
title: "react/no-did-mount-set-state"
rule: "react/no-did-mount-set-state"
category: "Correctness"
version: "1.36.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-did-mount-set-state.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows using `setState` in the `componentDidMount` lifecycle method.

This rule is not relevant for function components, and so can potentially be
disabled for modern React codebases.

### Why is this bad?

Updating the state after a component mount will trigger a second `render()` call and can lead to property/layout thrashing.
This can cause performance issues and unexpected behavior.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  componentDidMount: function () {
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
  componentDidMount: function () {
    this.onMount(function callback(newName) {
      this.setState({
        name: newName,
      });
    });
  },
  render: function () {
    return <div>Hello {this.state.name}</div>;
  },
});
```

## Configuration

This rule accepts one of the following string values:

### `"allowed"`

Allow `setState` calls in nested functions within `componentDidMount`, the default behavior.

### `"disallow-in-func"`

When set, also disallows `setState` calls in nested functions within `componentDidMount`.

## How to use

```json
{
  "rules": {
    "react/no-did-mount-set-state": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-did-mount-set-state": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.36.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-did-mount-set-state.md)
