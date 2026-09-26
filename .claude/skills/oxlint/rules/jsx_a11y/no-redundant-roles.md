---
title: "jsx-a11y/no-redundant-roles"
rule: "jsx-a11y/no-redundant-roles"
category: "Correctness"
version: "0.2.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-redundant-roles.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces that code does not include a redundant `role` property, in the
case that it's identical to the implicit `role` property of the
element type.

### Why is this bad?

Redundant roles can lead to confusion and verbosity in the codebase.

### Examples

This rule applies for the following elements and their implicit roles:

- `<nav>`: `navigation`
- `<button>`: `button`
- `<main>`: `main`

Examples of **incorrect** code for this rule:

```jsx
<nav role="navigation"></nav>
<button role="button"></button>
<main role="main"></main>
```

Examples of **correct** code for this rule:

```jsx
<nav></nav>
<button></button>
<main></main>
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/no-redundant-roles": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/no-redundant-roles": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-redundant-roles.md)
