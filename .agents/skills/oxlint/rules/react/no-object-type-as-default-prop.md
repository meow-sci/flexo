---
title: "react/no-object-type-as-default-prop"
rule: "react/no-object-type-as-default-prop"
category: "Perf"
version: "1.66.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-object-type-as-default-prop.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows using object, array, function, class, regex, JSX, or `new`-constructed
values as default values for destructured React component props.

### Why is this bad?

Default values of destructured parameters are evaluated on every render. When the
default is an object literal, array literal, function expression, class expression,
regular expression, `new` expression, or JSX element, a new reference is created on
every render. Passing that fresh reference to child components or hook dependency
arrays defeats memoization and causes unnecessary re-renders.

Note: you do not need to enable this rule when using React Compiler, since React
Compiler memoizes default values automatically.

### Examples

Examples of **incorrect** code for this rule:

```jsx
function Foo({ items = [] }) {
  return <List items={items} />;
}

const Bar = ({ config = {} }) => <div data-config={config} />;

function Baz({ onClick = () => {} }) {
  return <button onClick={onClick} />;
}
```

Examples of **correct** code for this rule:

```jsx
const DEFAULT_ITEMS = [];
function Foo({ items = DEFAULT_ITEMS }) {
  return <List items={items} />;
}

const Bar = ({ name = "world" }) => <div>{name}</div>;

function Baz({ onClick }) {
  return <button onClick={onClick} />;
}
```

## How to use

```json
{
  "rules": {
    "react/no-object-type-as-default-prop": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-object-type-as-default-prop": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.66.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-object-type-as-default-prop.md)
