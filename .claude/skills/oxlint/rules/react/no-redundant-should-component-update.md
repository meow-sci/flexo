---
title: "react/no-redundant-should-component-update"
rule: "react/no-redundant-should-component-update"
category: "Style"
version: "1.33.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-redundant-should-component-update.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow usage of `shouldComponentUpdate` when extending `React.PureComponent`.

Note that usage of `PureComponent` is
[not recommended in modern React](https://react.dev/reference/react/PureComponent).

### Why is this bad?

`React.PureComponent` automatically implements `shouldComponentUpdate` with a shallow prop and state comparison.
Defining `shouldComponentUpdate` in a class that extends `React.PureComponent` is redundant and defeats the purpose
of using `React.PureComponent`. If you need custom comparison logic, extend `React.Component` instead.

### Examples

Examples of **incorrect** code for this rule:

```jsx
class Foo extends React.PureComponent {
  shouldComponentUpdate() {
    // do check
  }

  render() {
    return <div>Radical!</div>;
  }
}

function Bar() {
  return class Baz extends React.PureComponent {
    shouldComponentUpdate() {
      // do check
    }

    render() {
      return <div>Groovy!</div>;
    }
  };
}
```

Examples of **correct** code for this rule:

```jsx
class Foo extends React.Component {
  shouldComponentUpdate() {
    // do check
  }

  render() {
    return <div>Radical!</div>;
  }
}

function Bar() {
  return class Baz extends React.Component {
    shouldComponentUpdate() {
      // do check
    }

    render() {
      return <div>Groovy!</div>;
    }
  };
}

class Qux extends React.PureComponent {
  render() {
    return <div>Tubular!</div>;
  }
}
```

## How to use

```json
{
  "rules": {
    "react/no-redundant-should-component-update": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-redundant-should-component-update": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-redundant-should-component-update.md)
