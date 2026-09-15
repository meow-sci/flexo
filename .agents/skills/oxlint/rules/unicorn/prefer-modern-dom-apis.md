---
title: "unicorn/prefer-modern-dom-apis"
rule: "unicorn/prefer-modern-dom-apis"
category: "Style"
version: "0.0.20"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-modern-dom-apis.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Enforces the use of:

- `childNode.replaceWith(newNode)` over `parentNode.replaceChild(newNode, oldNode)`
- `referenceNode.before(newNode)` over `parentNode.insertBefore(newNode, referenceNode)`
- `referenceNode.before('text')` over `referenceNode.insertAdjacentText('beforebegin', 'text')`
- `referenceNode.before(newNode)` over `referenceNode.insertAdjacentElement('beforebegin', newNode)`

### Why is this bad?

There are some advantages of using the newer DOM APIs, like:

- Traversing to the parent node is not necessary.
- Appending multiple nodes at once.
- Both `DOMString` and DOM node objects can be manipulated.

### Examples

Examples of **incorrect** code for this rule:

```javascript
oldChildNode.replaceWith(newChildNode);
```

Examples of **correct** code for this rule:

```javascript
parentNode.replaceChild(newChildNode, oldChildNode);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-modern-dom-apis": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-modern-dom-apis": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.20.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-modern-dom-apis.md)
