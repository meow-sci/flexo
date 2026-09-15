---
title: "react/button-has-type"
rule: "react/button-has-type"
category: "Restriction"
version: "0.1.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/button-has-type.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces explicit `type` attribute for all the `button` HTML elements.

### Why is this bad?

The default value of `type` attribute for `button` HTML element is
`"submit"` which is often not the desired behavior and may lead to
unexpected page reloads.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<button />
<button type="foo" />
```

Examples of **correct** code for this rule:

```jsx
<button type="button" />
<button type="submit" />
```

## Configuration

This rule accepts a configuration object with the following properties:

### button

type: `boolean`

default: `true`

If true, allow `type="button"`.

### reset

type: `boolean`

default: `true`

If true, allow `type="reset"`.

### submit

type: `boolean`

default: `true`

If true, allow `type="submit"`.

## How to use

```json
{
  "rules": {
    "react/button-has-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/button-has-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/button-has-type.md)
