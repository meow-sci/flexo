---
title: "jsx-a11y/click-events-have-key-events"
rule: "jsx-a11y/click-events-have-key-events"
category: "Correctness"
version: "0.2.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/click-events-have-key-events.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce onClick is accompanied by at least one of the following: onKeyUp, onKeyDown, onKeyPress.

### Why is this bad?

Coding for the keyboard is important for users with physical disabilities who cannot use a mouse, AT compatibility, and screenreader users.
This does not apply for interactive or hidden elements.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div onClick={() => void 0} />
```

Examples of **correct** code for this rule:

```jsx
<div onClick={() => void 0} onKeyDown={() => void 0} />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/click-events-have-key-events": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/click-events-have-key-events": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/click-events-have-key-events.md)
