---
title: "jsx-a11y/no-access-key"
rule: "jsx-a11y/no-access-key"
category: "Correctness"
version: "0.0.21"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-access-key.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Enforces that the `accessKey` prop is not used on any element to avoid complications with keyboard commands used by a screenreader.

### Why is this bad?

Access keys are HTML attributes that allow web developers to assign keyboard shortcuts to elements.
Inconsistencies between keyboard shortcuts and keyboard commands used by screenreaders and keyboard-only users create accessibility complications so to avoid complications, access keys should not be used.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div accessKey="h" />
```

Examples of **correct** code for this rule:

```jsx
<div />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/no-access-key": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/no-access-key": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.21.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-access-key.md)
