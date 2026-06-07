---
title: "nextjs/next-script-for-ga"
rule: "nextjs/next-script-for-ga"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/next-script-for-ga"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces the use of the `next/script` component when implementing Google Analytics in Next.js applications,
instead of using regular `<script>` tags.

### Why is this bad?

Using regular `<script>` tags for Google Analytics can lead to several issues:

- Scripts may load in a blocking manner, impacting page performance
- No built-in optimization or loading strategies
- Lack of automatic resource handling that Next.js provides

### Examples

Examples of **incorrect** code for this rule:

```jsx
// Using regular script tag with GA source
<script src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>

// Using inline script for GA initialization
<script dangerouslySetInnerHTML={{
  __html: `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'GA_MEASUREMENT_ID');
  `
}} />
```

Examples of **correct** code for this rule:

```jsx
import Script from 'next/script'

// Using next/script for GA source
<Script
  src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"
  strategy="lazyOnload"
/>

// Using next/script for GA initialization
<Script id="google-analytics">
  {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'GA_MEASUREMENT_ID');
  `}
</Script>
```

## How to use

```json
{
  "rules": {
    "nextjs/next-script-for-ga": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/next-script-for-ga": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/next-script-for-ga)
