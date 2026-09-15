---
title: "react/state-in-constructor"
rule: "react/state-in-constructor"
category: "Style"
version: "1.26.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/state-in-constructor.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces the state initialization style to be either in a
constructor or with a class property.

This rule is not relevant for function components, and so can potentially be
disabled for modern React codebases.

### Why is this bad?

Inconsistent state initialization styles can make the codebase harder to maintain and understand.
This rule enforces a consistent pattern across React class components.

### Examples

Examples of **incorrect** code for this rule by default, with `"always"` mode:

```jsx
class Foo extends React.Component {
  state = { bar: 0 };
  render() {
    return <div>Foo</div>;
  }
}
```

Examples of **correct** code for this rule by default, with `"always"` mode:

```jsx
class Foo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { bar: 0 };
  }
  render() {
    return <div>Foo</div>;
  }
}
```

#### `"never"` mode

Will enforce the state initialization style to be with a class property.

Examples of **incorrect** code for this rule with `"never"` mode:

```jsx
class Foo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { bar: 0 };
  }
  render() {
    return <div>Foo</div>;
  }
}
```

Examples of **correct** code for this rule with `"never"` mode:

```jsx
class Foo extends React.Component {
  state = { bar: 0 };
  render() {
    return <div>Foo</div>;
  }
}
```

## Configuration

This rule accepts one of the following string values:

### `"always"`

Enforce state initialization in the constructor.
This is the default mode.

### `"never"`

Enforce state initialization with a class property.

## How to use

```json
{
  "rules": {
    "react/state-in-constructor": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/state-in-constructor": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.26.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/state-in-constructor.md)
