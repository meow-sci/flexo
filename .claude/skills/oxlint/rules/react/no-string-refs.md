---
title: "react/no-string-refs"
rule: "react/no-string-refs"
category: "Correctness"
version: "0.0.15"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-string-refs.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule prevents using the deprecated behavior of string literals in ref attributes.

### Why is this bad?

Using string literals in ref attributes has been deprecated since React 16.3.0.

String refs are [removed entirely in React 19](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#removed-string-refs),
and so this rule can be disabled if on React 19+.

### Examples

Examples of **incorrect** code for this rule:

```jsx
var Hello = createReactClass({
  render: function () {
    return <div ref="hello">Hello, world.</div>;
  },
});

var Hello = createReactClass({
  componentDidMount: function () {
    var component = this.refs.hello;
    // ...do something with component
  },
  render: function () {
    return <div ref="hello">Hello, world.</div>;
  },
});
```

Examples of **correct** code for this rule:

```jsx
var Hello = createReactClass({
  componentDidMount: function () {
    var component = this.hello;
    // ...do something with component
  },
  render() {
    return (
      <div
        ref={(c) => {
          this.hello = c;
        }}
      >
        Hello, world.
      </div>
    );
  },
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### noTemplateLiterals

type: `boolean`

default: `false`

Disallow template literals in addition to string literals.

## How to use

```json
{
  "rules": {
    "react/no-string-refs": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-string-refs": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-string-refs.md)
