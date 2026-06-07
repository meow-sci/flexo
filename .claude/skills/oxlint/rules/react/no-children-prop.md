---
title: "react/no-children-prop"
rule: "react/no-children-prop"
category: "Correctness"
version: "0.0.14"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-children-prop.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Checks that children are not passed using a prop.

### Why is this bad?

Children should always be actual children, not passed in as a prop.
When using JSX, the children should be nested between the opening and closing tags.
When not using JSX, the children should be passed as additional arguments to `React.createElement`.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div children='Children' />

<MyComponent children={<AnotherComponent />} />
<MyComponent children={['Child 1', 'Child 2']} />
React.createElement("div", { children: 'Children' })
```

Examples of **correct** code for this rule:

```jsx
<div>Children</div>
<MyComponent>Children</MyComponent>

<MyComponent>
  <span>Child 1</span>
  <span>Child 2</span>
</MyComponent>

React.createElement("div", {}, 'Children')
React.createElement("div", 'Child 1', 'Child 2')
```

## How to use

```json
{
  "rules": {
    "react/no-children-prop": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-children-prop": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-children-prop.md)
