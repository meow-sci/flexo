---
title: "unicorn/throw-new-error"
rule: "unicorn/throw-new-error"
category: "Style"
version: "0.0.14"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/throw-new-error.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule makes sure you always use `new` when throwing an error.

### Why is this bad?

In JavaScript, omitting `new` (e.g., `throw Error('message')`) is allowed,
but it does not properly initialize the error object. This can lead to missing
stack traces or incorrect prototype chains. Using `new` makes the intent clear,
ensures consistent behavior, and helps avoid subtle bugs.

### Examples

Examples of **incorrect** code for this rule:

```javascript
throw Error("🦄");
throw TypeError("unicorn");
throw lib.TypeError("unicorn");
```

Examples of **correct** code for this rule:

```javascript
throw new Error("🦄");
throw new TypeError("unicorn");
throw new lib.TypeError("unicorn");
```

## How to use

```json
{
  "rules": {
    "unicorn/throw-new-error": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/throw-new-error": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/throw-new-error.md)
