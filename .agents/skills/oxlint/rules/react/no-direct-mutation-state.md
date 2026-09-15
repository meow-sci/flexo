---
title: "react/no-direct-mutation-state"
rule: "react/no-direct-mutation-state"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-direct-mutation-state.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule forbids the direct mutation of `this.state` in React components.

Note that this rule only applies to class components, it does not apply to function
components. For modern React codebases, this rule may not be necessary or relevant.

### Why is this bad?

React components should _never_ mutate `this.state` directly, as
calling `setState()` afterwards may replace the mutation you made.

`this.state` should be treated as if it were immutable.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  componentDidMount: function () {
    this.state.name = this.props.name.toUpperCase();
  },
  render: function () {
    return <div>Hello {this.state.name}</div>;
  },
});

class Hello extends React.Component {
  constructor(props) {
    super(props);

    doSomethingAsync(() => {
      this.state = "bad";
    });
  }
}
```

Examples of **correct** code for this rule:

```jsx
var Hello = createReactClass({
  componentDidMount: function() {
    this.setState({
      name: this.props.name.toUpperCase();
    });
  },
  render: function() {
    return <div>Hello {this.state.name}</div>;
  }
});

class Hello extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      foo: 'bar',
    }
  }
}
```

## How to use

```json
{
  "rules": {
    "react/no-direct-mutation-state": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-direct-mutation-state": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-direct-mutation-state.md)
