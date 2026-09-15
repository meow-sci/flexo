---
title: "react/no-set-state"
rule: "react/no-set-state"
category: "Style"
version: "0.5.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-set-state.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow the usage of `this.setState` in React components.

### Why is this bad?

When using an architecture that separates your application state from your UI components
(e.g. Flux), it may be desirable to forbid the use of local component state. This rule is
especially helpful in read-only applications (that don't use forms), since local component
state should rarely be necessary in such cases.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  getInitialState: function () {
    return {
      name: this.props.name,
    };
  },
  handleClick: function () {
    this.setState({
      name: this.props.name.toUpperCase(),
    });
  },
  render: function () {
    return <div onClick={this.handleClick.bind(this)}>Hello {this.state.name}</div>;
  },
});
```

## How to use

```json
{
  "rules": {
    "react/no-set-state": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-set-state": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.2.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-set-state.md)
