---
title: "react/no-this-in-sfc"
rule: "react/no-this-in-sfc"
category: "Correctness"
version: "1.37.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-this-in-sfc.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents using `this` in stateless functional components.

### Why is this bad?

In React, stateless functional components (SFCs) receive props and context as function parameters,
not through `this`. Using `this` in an SFC typically indicates a mistake when converting from
class components or unfamiliarity with the two component styles.

### Examples

Examples of **incorrect** code for this rule:

```jsx
function Foo(props) {
  return <div>{this.props.bar}</div>;
}

function Foo(props) {
  const { bar } = this.props;
  return <div>{bar}</div>;
}

const Foo = (props) => (this.props.foo ? <span>{props.bar}</span> : null);
```

Examples of **correct** code for this rule:

```jsx
function Foo(props) {
  return <div>{props.bar}</div>;
}

function Foo({ bar }) {
  return <div>{bar}</div>;
}

class Foo extends React.Component {
  render() {
    return <div>{this.props.bar}</div>;
  }
}
```

## How to use

```json
{
  "rules": {
    "react/no-this-in-sfc": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-this-in-sfc": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.37.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-this-in-sfc.md)
