---
title: "jsx-a11y/iframe-has-title"
rule: "jsx-a11y/iframe-has-title"
category: "Correctness"
version: "0.0.19"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/iframe-has-title.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce iframe elements have a title attribute.

### Why is this bad?

Screen reader users rely on a iframe title to describe the contents of
the iframe. Navigating through iframe and iframe elements quickly
becomes difficult and confusing for users of this technology if the
markup does not contain a title attribute.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<iframe />
<iframe {...props} />
<iframe title="" />
<iframe title={''} />
<iframe title={``} />
<iframe title={undefined} />
<iframe title={false} />
<iframe title={true} />
<iframe title={42} />
```

Examples of **correct** code for this rule:

```jsx
<iframe title="This is a unique title" />
<iframe title={uniqueTitle} />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/iframe-has-title": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/iframe-has-title": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/iframe-has-title.md)
