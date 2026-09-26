---
title: "unicorn/prefer-dom-node-append"
rule: "unicorn/prefer-dom-node-append"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-append.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces the use of, for example, `document.body.append(div);` over `document.body.appendChild(div);` for DOM nodes.

### Why is this bad?

There are [some advantages of using `Node#append()`](https://developer.mozilla.org/en-US/docs/Web/API/ParentNode/append), like the ability to append multiple nodes and to append both [`DOMString`](https://developer.mozilla.org/en-US/docs/Web/API/DOMString) and DOM node objects.

### Examples

Examples of **incorrect** code for this rule:

```javascript
foo.appendChild(bar);
```

Examples of **correct** code for this rule:

```javascript
foo.append(bar);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-dom-node-append": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-dom-node-append": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-dom-node-append.md)
