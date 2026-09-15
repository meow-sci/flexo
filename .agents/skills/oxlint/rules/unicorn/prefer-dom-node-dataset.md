---
title: "unicorn/prefer-dom-node-dataset"
rule: "unicorn/prefer-dom-node-dataset"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-dataset.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Use [`.dataset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset) on DOM elements over `getAttribute(…)`, `.setAttribute(…)`, `.removeAttribute(…)` and `.hasAttribute(…)`.

### Why is this bad?

The `dataset` property is a map of strings that contains all the `data-*` attributes from the element. It is a convenient way to access all of them at once.

### Examples

Examples of **incorrect** code for this rule:

```javascript
element.setAttribute("data-unicorn", "🦄");
```

Examples of **correct** code for this rule:

```javascript
element.dataset.unicorn = "🦄";
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-dom-node-dataset": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-dom-node-dataset": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-dataset.md)
