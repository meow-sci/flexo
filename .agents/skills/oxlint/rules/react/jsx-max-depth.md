---
title: "react/jsx-max-depth"
rule: "react/jsx-max-depth"
category: "Style"
version: "1.36.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-max-depth.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces a maximum depth for nested JSX elements and fragments.

### Why is this bad?

Excessively nested JSX makes components harder to read and maintain.

### Examples

Examples of **incorrect** code for this rule:

```jsx
const Component = () => (
  <div>
    <div>
      <div>
        <span />
      </div>
    </div>
  </div>
);
```

Examples of **correct** code for this rule:

```jsx
const Component = () => (
  <div>
    <div>
      <span />
    </div>
  </div>
);
```

## Configuration

This rule accepts a configuration object with the following properties:

### max

type: `integer`

default: `2`

The maximum allowed depth of nested JSX elements and fragments.

## How to use

```json
{
  "rules": {
    "react/jsx-max-depth": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/jsx-max-depth": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.36.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-max-depth.md)
