---
title: "unicorn/relative-url-style"
rule: "unicorn/relative-url-style"
category: "Style"
version: "1.44.0"
default: false
type_aware: false
fix: "fixable_safe_fix_or_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/relative-url-style.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

Enforce consistent relative URL style.

### Why is this bad?

When using a relative URL in `new URL()`, the URL should either never or always use the `./` prefix consistently.

### Examples

Examples of **incorrect** code for this rule with the default `"never"` option:

```js
new URL("./foo", base);
```

Examples of **correct** code for this rule with the default `"never"` option:

```js
new URL("foo", base);
```

Examples of **incorrect** code for this rule with the `"always"` option:

```js
new URL("foo", base);
```

Examples of **correct** code for this rule with the `"always"` option:

```js
new URL("./foo", base);
```

## Configuration

This rule accepts one of the following string values:

### `"never"`

Never use a `./` prefix.

### `"always"`

Always add a `./` prefix to the relative URL when possible.

## How to use

```json
{
  "rules": {
    "unicorn/relative-url-style": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/relative-url-style": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.44.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/relative-url-style.md)
