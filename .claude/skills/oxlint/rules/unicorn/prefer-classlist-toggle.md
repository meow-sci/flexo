---
title: "unicorn/prefer-classlist-toggle"
rule: "unicorn/prefer-classlist-toggle"
category: "Style"
version: "1.20.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-classlist-toggle.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers the use of `element.classList.toggle(className, condition)` over
conditional add/remove patterns.

### Why is this bad?

The `toggle()` method is more concise and expressive than using conditional
logic to switch between `add()` and `remove()`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (condition) {
  element.classList.add("className");
} else {
  element.classList.remove("className");
}

condition ? element.classList.add("className") : element.classList.remove("className");

element.classList[condition ? "add" : "remove"]("className");
```

Examples of **correct** code for this rule:

```javascript
element.classList.toggle("className", condition);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-classlist-toggle": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-classlist-toggle": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-classlist-toggle.md)
