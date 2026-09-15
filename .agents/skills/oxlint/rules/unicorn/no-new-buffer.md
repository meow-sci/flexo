---
title: "unicorn/no-new-buffer"
rule: "unicorn/no-new-buffer"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-new-buffer.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows the deprecated `new Buffer()` constructor.

### Why is this bad?

Enforces the use of [Buffer.from](https://nodejs.org/api/buffer.html#static-method-bufferfromarray) and [Buffer.alloc()](https://nodejs.org/api/buffer.html#static-method-bufferallocsize-fill-encoding) instead of [new Buffer()](https://nodejs.org/api/buffer.html#new-bufferarray), which has been deprecated since Node.js 4.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const buffer = new Buffer(10);
```

Examples of **correct** code for this rule:

```javascript
const buffer = Buffer.alloc(10);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-new-buffer": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-new-buffer": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-new-buffer.md)
