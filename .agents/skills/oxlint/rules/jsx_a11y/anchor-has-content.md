---
title: "jsx-a11y/anchor-has-content"
rule: "jsx-a11y/anchor-has-content"
category: "Correctness"
version: "0.0.18"
default: false
type_aware: false
fix: "conditional_suggestion"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/anchor-has-content.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 💡 conditional suggestion |
| Type-aware | no |


### What it does

Enforce that anchors have content and that the content is accessible to screen readers.
Accessible means that it is not hidden using the `aria-hidden` prop.

Alternatively, you may use the `title` prop or the `aria-label` prop.

### Why is this bad?

Anchor elements without content can be confusing for users relying
on screen readers to understand.

### Examples

Examples of **correct** code for this rule:

```jsx
<a>Anchor Content!</a>
<a><TextWrapper /></a>
<a dangerouslySetInnerHTML={{ __html: 'foo' }} />
<a title='foo' />
<a aria-label='foo' />
```

Examples of **incorrect** code for this rule:

```jsx
<a />
<a><TextWrapper aria-hidden /></a>
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/anchor-has-content": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/anchor-has-content": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/anchor-has-content.md)
