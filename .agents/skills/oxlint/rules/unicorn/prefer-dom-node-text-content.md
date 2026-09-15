---
title: "unicorn/prefer-dom-node-text-content"
rule: "unicorn/prefer-dom-node-text-content"
category: "Style"
version: "0.0.21"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-text-content.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforces the use of `.textContent` over `.innerText` for DOM nodes.

### Why is this bad?

There are some disadvantages of using .innerText.

- `.innerText` is much more performance-heavy as it requires layout information to return the result.
- `.innerText` is defined only for HTMLElement objects, while `.textContent` is defined for all Node objects.
- `.innerText` is not standard, for example, it is not present in Firefox.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const text = foo.innerText;
```

Examples of **correct** code for this rule:

```javascript
const text = foo.textContent;
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-dom-node-text-content": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-dom-node-text-content": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.21.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-text-content.md)
