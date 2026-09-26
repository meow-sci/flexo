---
title: "react/prefer-es6-class"
rule: "react/prefer-es6-class"
category: "Style"
version: "0.5.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/prefer-es6-class.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

React offers you two ways to create traditional components: using the
`create-react-class` package or the newer ES2015 class system.

Note that function components are preferred over class components in modern React,
and it is _especially_ discouraged to use `createReactClass` in modern React.

### Why is this bad?

This rule enforces a consistent React class style.

### Examples

Examples of **incorrect** code for this rule by default:

```jsx
var Hello = createReactClass({
  render: function () {
    return <div>Hello {this.props.name}</div>;
  },
});
```

## Configuration

This rule accepts one of the following string values:

### `"always"`

Always prefer ES2015 class-style components.

### `"never"`

Do not allow ES2015 class-style, prefer `createReactClass`.

## How to use

```json
{
  "rules": {
    "react/prefer-es6-class": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/prefer-es6-class": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/prefer-es6-class.md)
