---
title: "unicorn/prefer-dom-node-remove"
rule: "unicorn/prefer-dom-node-remove"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-remove.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Prefers the use of `child.remove()` over `parentNode.removeChild(child)`.

### Why is this bad?

The DOM function [`Node#remove()`](https://developer.mozilla.org/en-US/docs/Web/API/ChildNode/remove) is preferred
over the indirect removal of an object with [`Node#removeChild()`](https://developer.mozilla.org/en-US/docs/Web/API/Node/removeChild).

### Examples

Examples of **incorrect** code for this rule:

```javascript
parentNode.removeChild(childNode);
```

Examples of **correct** code for this rule:

```javascript
childNode.remove();
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-dom-node-remove": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-dom-node-remove": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-remove.md)
