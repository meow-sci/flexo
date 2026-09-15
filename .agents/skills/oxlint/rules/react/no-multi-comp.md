---
title: "react/no-multi-comp"
rule: "react/no-multi-comp"
category: "Restriction"
version: "1.43.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-multi-comp.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents multiple React components from being defined in the same file.

### Why is this bad?

Declaring multiple components in a single file can make it harder to navigate
and maintain the codebase. Each component should ideally be in its own file
for better organization and reusability.

### Examples

Examples of **incorrect** code for this rule:

```jsx
function Foo({ name }) {
  return <div>Hello {name}</div>;
}

function Bar({ name }) {
  return <div>Hello again {name}</div>;
}
```

Examples of **correct** code for this rule:

```jsx
function Foo({ name }) {
  return <div>Hello {name}</div>;
}
```

## Configuration

### ignoreStateless

type: `boolean`

default: `false`

When `true`, the rule will ignore stateless components and will allow you to have multiple
stateless components in the same file. Or one stateful component and one-or-more stateless
components in the same file.

Stateless basically just means function components, including those created via
`memo` and `forwardRef`.

## How to use

```json
{
  "rules": {
    "react/no-multi-comp": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-multi-comp": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.43.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-multi-comp.md)
