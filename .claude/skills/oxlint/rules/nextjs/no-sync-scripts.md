---
title: "nextjs/no-sync-scripts"
rule: "nextjs/no-sync-scripts"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-sync-scripts"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule prevents the use of synchronous `<script>` tags in Next.js applications.
It requires that any `<script>` tag with a `src` attribute must also have either
the `async` or `defer` attribute.

### Why is this bad?

Synchronous scripts can block the page rendering and negatively impact performance.
In Next.js applications, it's recommended to use `async` or `defer` attributes
to load scripts asynchronously, which improves page load times and user experience.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// Synchronous script without async/defer
<script src="https://example.com/script.js"></script>

// Dynamic src without async/defer
<script src={dynamicSrc}></script>
```

Examples of **correct** code for this rule:

```javascript
// Script with async attribute
<script src="https://example.com/script.js" async></script>

// Script with defer attribute
<script src="https://example.com/script.js" defer></script>

// Script with spread props (allowed as it might include async/defer)
<script {...props}></script>
```

## How to use

```json
{
  "rules": {
    "nextjs/no-sync-scripts": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-sync-scripts": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-sync-scripts)
