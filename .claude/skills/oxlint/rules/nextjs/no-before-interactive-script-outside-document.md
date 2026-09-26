---
title: "nextjs/no-before-interactive-script-outside-document"
rule: "nextjs/no-before-interactive-script-outside-document"
category: "Correctness"
version: "0.2.7"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-before-interactive-script-outside-document"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the usage of `next/script`'s `beforeInteractive` strategy outside of `pages/_document.js`.
This rule ensures that scripts with the `beforeInteractive` loading strategy are only used in the
document component where they are most effective.

### Why is this bad?

The `beforeInteractive` strategy is specifically designed to load scripts before any page hydration
occurs, which is only guaranteed to work correctly when placed in `pages/_document.js`. Using it elsewhere:

- May not achieve the intended early loading behavior
- Can lead to inconsistent script loading timing
- Might cause hydration mismatches or other runtime issues
- Could impact the application's performance optimization

### Examples

Examples of **incorrect** code for this rule:

```jsx
// pages/index.js
import Script from "next/script";

export default function HomePage() {
  return (
    <div>
      <Script
        src="https://example.com/script.js"
        strategy="beforeInteractive" // ❌ Wrong placement
      />
    </div>
  );
}
```

Examples of **correct** code for this rule:

```jsx
// pages/_document.js
import Document, { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Script
            src="https://example.com/script.js"
            strategy="beforeInteractive" // ✅ Correct placement
          />
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
```

## How to use

```json
{
  "rules": {
    "nextjs/no-before-interactive-script-outside-document": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-before-interactive-script-outside-document": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.7.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-before-interactive-script-outside-document)
