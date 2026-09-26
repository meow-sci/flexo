---
title: "react/display-name"
rule: "react/display-name"
category: "Pedantic"
version: "1.42.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/display-name.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that React components have a `displayName` property.

### Why is this bad?

React DevTools uses `displayName` to show component names in the component tree.
Without `displayName`, components will show up as "Unknown" in DevTools.

### Examples

Examples of **incorrect** code for this rule:

```jsx
const MyComponent = () => <div>Hello</div>;
```

Examples of **correct** code for this rule:

```jsx
const MyComponent = () => <div>Hello</div>;
MyComponent.displayName = "MyComponent";
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkContextObjects

type: `boolean`

default: `false`

When `true`, this rule will warn on context objects
without a `displayName`.

`displayName` allows you to [name your context](https://reactjs.org/docs/context.html#contextdisplayname) object.
This name is used in the React DevTools for the context's `Provider` and `Consumer`.

### ignoreTranspilerName

type: `boolean`

default: `false`

When `true`, the rule will ignore the name set by the transpiler
and require a `displayName` property in this case.

## How to use

```json
{
  "rules": {
    "react/display-name": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/display-name": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.42.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/display-name.md)
