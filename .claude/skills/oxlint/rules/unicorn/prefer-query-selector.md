---
title: "unicorn/prefer-query-selector"
rule: "unicorn/prefer-query-selector"
category: "Pedantic"
version: "0.0.15"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-query-selector.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Prefer `.querySelector()` over `.getElementById()`. And prefer `.querySelectorAll()`
over `.getElementsByClassName()`, `.getElementsByTagName()`, and `.getElementsByName()`.

### Why is this bad?

- Using `.querySelector()` and `.querySelectorAll()` is more flexible and allows for more specific selectors.
- It's better to use the same method to query DOM elements. This helps keep consistency and it lends itself to future improvements (e.g. more specific selectors).

### Examples

Examples of **incorrect** code for this rule:

```javascript
document.getElementById("foo");
document.getElementsByClassName("foo bar");
document.getElementsByTagName("main");
document.getElementsByClassName(fn());
document.getElementsByName("foo");
```

Examples of **correct** code for this rule:

```javascript
document.querySelector("#foo");
document.querySelector(".bar");
document.querySelector("main #foo .bar");
document.querySelectorAll(".foo .bar");
document.querySelectorAll("li a");
document.querySelector("li").querySelectorAll("a");
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-query-selector": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-query-selector": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-query-selector.md)
