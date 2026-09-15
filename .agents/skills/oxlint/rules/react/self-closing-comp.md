---
title: "react/self-closing-comp"
rule: "react/self-closing-comp"
category: "Style"
version: "0.9.3"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/self-closing-comp.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Detects components without children which can be self-closed to avoid
unnecessary extra closing tags.

### Why is this bad?

Components without children don't need explicit closing tags. Using
self-closing syntax makes code more concise and reduces visual clutter.
It also follows common React and JSX conventions for empty elements.

A self-closing component which contains whitespace is allowed except
when it also contains a newline.

### Examples

Examples of **incorrect** code for this rule:

```jsx
const elem = <Component linter="oxlint"></Component>;
const dom_elem = <div id="oxlint"></div>;
const welem = <div id="oxlint"></div>;
```

Examples of **correct** code for this rule:

```jsx
const elem = <Component linter="oxlint" />;
const welem = <Component linter="oxlint"> </Component>;
const dom_elem = <div id="oxlint" />;
```

## Configuration

This rule accepts a configuration object with the following properties:

### component

type: `boolean`

default: `true`

Whether to enforce self-closing for custom components.

### html

type: `boolean`

default: `true`

Whether to enforce self-closing for native HTML elements.

## How to use

```json
{
  "rules": {
    "react/self-closing-comp": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/self-closing-comp": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.3.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/self-closing-comp.md)
