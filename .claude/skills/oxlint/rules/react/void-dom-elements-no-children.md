---
title: "react/void-dom-elements-no-children"
rule: "react/void-dom-elements-no-children"
category: "Correctness"
version: "0.2.11"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/void-dom-elements-no-children.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow void DOM elements (e.g. `<img />`, `<br />`) from receiving children.

### Why is this bad?

There are some HTML elements that are only self-closing (e.g. img, br, hr). These are collectively known as void DOM elements.
This rule checks that children are not passed to void DOM elements.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<br>Children</br>
<br children='Children' />
<br dangerouslySetInnerHTML={{ __html: 'HTML' }} />
React.createElement('br', undefined, 'Children')
React.createElement('br', { children: 'Children' })
React.createElement('br', { dangerouslySetInnerHTML: { __html: 'HTML' } })
```

Examples of **correct** code for this rule:

```jsx
<div>Children</div>
<div children='Children' />
<div dangerouslySetInnerHTML={{ __html: 'HTML' }} />
React.createElement('div', undefined, 'Children')
React.createElement('div', { children: 'Children' })
React.createElement('div', { dangerouslySetInnerHTML: { __html: 'HTML' } })
```

## How to use

```json
{
  "rules": {
    "react/void-dom-elements-no-children": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/void-dom-elements-no-children": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.11.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/void-dom-elements-no-children.md)
