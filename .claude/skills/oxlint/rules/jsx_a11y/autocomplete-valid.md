---
title: "jsx-a11y/autocomplete-valid"
rule: "jsx-a11y/autocomplete-valid"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/autocomplete-valid.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that an element's autocomplete attribute must be a valid value.

### Why is this bad?

Incorrectly using the autocomplete attribute may decrease the accessibility of the website for users.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<input autocomplete="invalid-value" />
```

Examples of **correct** code for this rule:

```jsx
<input autocomplete="name" />
```

## Configuration

This rule accepts a configuration object with the following properties:

### inputComponents

type: `string[]`

default: `["input"]`

List of custom component names that should be treated as input elements.

## How to use

```json
{
  "rules": {
    "jsx-a11y/autocomplete-valid": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/autocomplete-valid": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/autocomplete-valid.md)
