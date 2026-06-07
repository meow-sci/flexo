---
title: "unicorn/prefer-reflect-apply"
rule: "unicorn/prefer-reflect-apply"
category: "Style"
version: "0.0.19"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-reflect-apply.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows the use of `Function.prototype.apply()` and suggests using `Reflect.apply()` instead.

### Why is this bad?

`Reflect.apply()` is arguably less verbose and easier to understand.
In addition, when you accept arbitrary methods,
it's not safe to assume `.apply()` exists or is not overridden.

### Examples

Examples of **incorrect** code for this rule:

```javascript
foo.apply(null, [42]);
```

Examples of **correct** code for this rule:

```javascript
Reflect.apply(foo, null);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-reflect-apply": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-reflect-apply": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-reflect-apply.md)
