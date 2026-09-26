---
title: "react/no-find-dom-node"
rule: "react/no-find-dom-node"
category: "Correctness"
version: "0.0.15"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-find-dom-node.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule disallows the use of `findDOMNode`, which was deprecated in 2018 and removed in React 19.

### Why is this bad?

`findDOMNode` is an escape hatch used to access the underlying DOM node.
In most cases, use of this escape hatch is discouraged because it pierces the component abstraction.
It has been deprecated for years, and was
[removed from React entirely in React 19](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#removed-reactdom-finddomnode).

It should not be used.

### Examples

Examples of **incorrect** code for this rule:

```jsx
class MyComponent extends Component {
  componentDidMount() {
    findDOMNode(this).scrollIntoView();
  }
  render() {
    return <div />;
  }
}
```

## How to use

```json
{
  "rules": {
    "react/no-find-dom-node": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-find-dom-node": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-find-dom-node.md)
