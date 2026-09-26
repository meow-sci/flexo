---
title: "jsx-a11y/role-supports-aria-props"
rule: "jsx-a11y/role-supports-aria-props"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/role-supports-aria-props.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that elements with explicit or implicit roles defined contain only `aria-*` properties supported by that `role`.
Many ARIA attributes (states and properties) can only be used on elements with particular roles.
Some elements have implicit roles, such as `<a href="#" />`, which will resolve to `role="link"`.

### Why is this bad?

Using ARIA attributes that are inconsistent with the element's role can cause problems for assistive
technologies and their ability to understand or engage with the content of a page.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<ul role="radiogroup" "aria-labelledby"="foo">
    <li aria-required tabIndex="-1" role="radio" aria-checked="false">Rainbow Trout</li>
    <li aria-required tabIndex="-1" role="radio" aria-checked="false">Brook Trout</li>
    <li aria-required tabIndex="0" role="radio" aria-checked="true">Lake Trout</li>
</ul>
```

Examples of **correct** code for this rule:

```jsx
<ul role="radiogroup" aria-required "aria-labelledby"="foo">
    <li tabIndex="-1" role="radio" aria-checked="false">Rainbow Trout</li>
    <li tabIndex="-1" role="radio" aria-checked="false">Brook Trout</li>
    <li tabIndex="0" role="radio" aria-checked="true">Lake Trout</li>
</ul>
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/role-supports-aria-props": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/role-supports-aria-props": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/role-supports-aria-props.md)
