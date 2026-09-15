---
title: "eslint/no-script-url"
rule: "eslint/no-script-url"
category: "Style"
version: "0.2.15"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-script-url"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `javascript:` URLs.

### Why is this bad?

Using `javascript:` URLs is considered by some as a form of `eval`. Code
passed in `javascript:` URLs must be parsed and evaluated by the browser
in the same way that `eval` is processed. This can lead to security and
performance issues.

### Examples

Examples of **incorrect** code for this rule:

```javascript
location.href = "javascript:void(0)";

location.href = `javascript:void(0)`;
```

## How to use

```json
{
  "rules": {
    "eslint/no-script-url": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-script-url": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.15.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-script-url)
