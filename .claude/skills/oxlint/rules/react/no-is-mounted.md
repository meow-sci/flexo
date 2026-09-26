---
title: "react/no-is-mounted"
rule: "react/no-is-mounted"
category: "Correctness"
version: "0.0.19"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-is-mounted.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule prevents using `isMounted` in class components.

### Why is this bad?

`isMounted` is an anti-pattern, and is not available
when using classes or function components.

### Examples

Examples of **incorrect** code for this rule:

```jsx
class Hello extends React.Component {
  someMethod() {
    if (!this.isMounted()) {
      return;
    }
  }
  render() {
    return <div onClick={this.someMethod.bind(this)}>Hello</div>;
  }
}
```

## How to use

```json
{
  "rules": {
    "react/no-is-mounted": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-is-mounted": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-is-mounted.md)
