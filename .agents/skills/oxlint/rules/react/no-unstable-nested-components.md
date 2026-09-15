---
title: "react/no-unstable-nested-components"
rule: "react/no-unstable-nested-components"
category: "Suspicious"
version: "1.66.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unstable-nested-components.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows defining React components inside other components.

### Why is this bad?

React compares element types by reference during reconciliation. A component defined during
render gets a new identity on every render, so React remounts the entire nested subtree and
destroys its DOM nodes and state.

### Examples

Examples of **incorrect** code for this rule:

```jsx
function Component() {
  function UnstableNestedComponent() {
    return <div />;
  }

  return <UnstableNestedComponent />;
}
```

Examples of **correct** code for this rule:

```jsx
function StableComponent() {
  return <div />;
}

function Component() {
  return <StableComponent />;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowAsProps

type: `boolean`

default: `false`

Allow component definitions in props.

### customValidators

type: `string[]`

default: `[]`

Optional custom propTypes validators accepted for eslint-plugin-react compatibility.

### propNamePattern

type: `string`

default: `"render*"`

Glob pattern for render-prop names that may receive inline component definitions.

## How to use

```json
{
  "rules": {
    "react/no-unstable-nested-components": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-unstable-nested-components": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.66.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unstable-nested-components.md)
