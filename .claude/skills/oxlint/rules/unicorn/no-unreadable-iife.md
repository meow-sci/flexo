---
title: "unicorn/no-unreadable-iife"
rule: "unicorn/no-unreadable-iife"
category: "Pedantic"
version: "0.0.19"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unreadable-iife.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule disallows IIFEs with a parenthesized arrow function body.

### Why is this bad?

IIFEs with a parenthesized arrow function body are unreadable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = ((bar) => (bar ? bar.baz : baz))(getBar());

const foo = ((bar, baz) => ({ bar, baz }))(bar, baz);
```

Examples of **correct** code for this rule:

```javascript
const bar = getBar();
const foo = bar ? bar.baz : baz;

const getBaz = (bar) => (bar ? bar.baz : baz);
const foo = getBaz(getBar());

const foo = ((bar) => {
  return bar ? bar.baz : baz;
})(getBar());
```

## How to use

```json
{
  "rules": {
    "unicorn/no-unreadable-iife": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-unreadable-iife": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unreadable-iife.md)
