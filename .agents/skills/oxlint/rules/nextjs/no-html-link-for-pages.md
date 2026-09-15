---
title: "nextjs/no-html-link-for-pages"
rule: "nextjs/no-html-link-for-pages"
category: "Correctness"
version: "1.7.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-html-link-for-pages"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the usage of `<a>` elements to navigate between Next.js pages.

### Why is this bad?

Using `<a>` elements for internal navigation in Next.js applications can cause:

- Full page reloads instead of client-side navigation
- Loss of application state
- Slower navigation performance
- Broken prefetching capabilities

Next.js provides the `<Link />` component from `next/link` for client-side navigation
between pages, which provides better performance and user experience.

### Examples

Examples of **incorrect** code for this rule:

```jsx
function HomePage() {
  return (
    <div>
      <a href="/about">About Us</a>
      <a href="/contact">Contact</a>
    </div>
  );
}
```

Examples of **correct** code for this rule:

```jsx
import Link from "next/link";

function HomePage() {
  return (
    <div>
      <Link href="/about">About Us</Link>
      <Link href="/contact">Contact</Link>
    </div>
  );
}
```

External links are allowed:

```jsx
function HomePage() {
  return (
    <div>
      <a href="https://example.com">External Link</a>
      <a href="mailto:contact@example.com">Email</a>
      <a href="tel:+1234567890">Phone</a>
    </div>
  );
}
```

## How to use

```json
{
  "rules": {
    "nextjs/no-html-link-for-pages": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-html-link-for-pages": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.7.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-html-link-for-pages)
