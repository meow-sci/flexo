---
title: "react/no-did-update-set-state"
rule: "react/no-did-update-set-state"
category: "Correctness"
version: "1.62.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-did-update-set-state.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow usage of `setState` in `componentDidUpdate`.

### Why is this bad?

Updating the state after a component update will trigger a second `render()` call and can lead to property/layout thrashing.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  componentDidUpdate: function () {
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
  componentDidUpdate: function () {
    this.props.onUpdate();
  },
  render: function () {
    return <div>Hello {this.props.name}</div>;
  },
});
```

```jsx
var Hello = createReactClass({
  componentDidUpdate: function () {
    this.onUpdate(function callback(newName) {
      this.setState({
        name: newName,
      });
    });
  },
  render: function () {
    return <div>Hello {this.props.name}</div>;
  },
});
```

## Configuration

This rule accepts one of the following string values:

### `"allowed"`

Forbids any call to `this.setState` in `componentDidUpdate`
outside of functions.

### `"disallow-in-func"`

The `disallow-in-func` mode makes this rule more strict by disallowing calls to
`this.setState` even within functions.

Examples of **incorrect** code for this rule with the `"disallow-in-func"` option:

```jsx
var Hello = createReactClass({
  componentDidUpdate: function () {
    this.setState({
      name: this.props.name.toUpperCase(),
    });
  },
  render: function () {
    return <div>Hello {this.state.name}</div>;
  },
});
```

```jsx
var Hello = createReactClass({
  componentDidUpdate: function () {
    this.onUpdate(function callback(newName) {
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

## How to use

```json
{
  "rules": {
    "react/no-did-update-set-state": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-did-update-set-state": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.62.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-did-update-set-state.md)
