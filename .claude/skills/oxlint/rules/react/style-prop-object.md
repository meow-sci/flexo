---
title: "react/style-prop-object"
rule: "react/style-prop-object"
category: "Suspicious"
version: "0.11.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/style-prop-object.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require that the value of the prop `style` be an object or a variable that is an object.

### Why is this bad?

The `style` prop expects an object mapping from style properties to values when using JSX.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div style="color: 'red'" />
<div style={true} />
<Hello style={true} />
const styles = true;
<div style={styles} />

React.createElement("div", { style: "color: 'red'" });
React.createElement("div", { style: true });
React.createElement("Hello", { style: true });
const styles = true;
React.createElement("div", { style: styles });
```

Examples of **correct** code for this rule:

```jsx
<div style={{ color: "red" }} />
<Hello style={{ color: "red" }} />
const styles = { color: "red" };
<div style={styles} />

React.createElement("div", { style: { color: 'red' }});
React.createElement("Hello", { style: { color: 'red' }});
const styles = { height: '100px' };
React.createElement("div", { style: styles });
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `string[]`

default: `[]`

List of component names on which to allow `style` prop values of any type.

## How to use

```json
{
  "rules": {
    "react/style-prop-object": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/style-prop-object": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.11.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/style-prop-object.md)
