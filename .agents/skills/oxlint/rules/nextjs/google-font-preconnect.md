---
title: "nextjs/google-font-preconnect"
rule: "nextjs/google-font-preconnect"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/google-font-preconnect"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces the presence of `rel="preconnect"` when using Google Fonts via `<link>` tags.

### Why is this bad?

When using Google Fonts, it's recommended to include a preconnect resource hint to establish early connections to the required origin.
Without preconnect, the browser needs to perform DNS lookups, TCP handshakes, and TLS negotiations before it can download the font files,
which can delay font loading and impact performance.

### Examples

Examples of **incorrect** code for this rule:

```javascript
<link href="https://fonts.gstatic.com" />
<link rel="preload" href="https://fonts.gstatic.com" />
```

Examples of **correct** code for this rule:

```javascript
<link rel="preconnect" href="https://fonts.gstatic.com" />
```

## How to use

```json
{
  "rules": {
    "nextjs/google-font-preconnect": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/google-font-preconnect": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/google-font-preconnect)
