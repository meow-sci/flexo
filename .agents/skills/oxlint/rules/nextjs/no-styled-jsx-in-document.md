---
title: "nextjs/no-styled-jsx-in-document"
rule: "nextjs/no-styled-jsx-in-document"
category: "Correctness"
version: "0.3.3"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-styled-jsx-in-document"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent usage of styled-jsx in `pages/_document.js`.

### Why is this bad?

Custom CSS like styled-jsx is not allowed in a [Custom Document](https://nextjs.org/docs/pages/building-your-application/routing/custom-document).

### Examples

Examples of **incorrect** code for this rule:

```javascript
// pages/_document.js
import Document, { Html, Head, Main, NextScript } from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
          <style jsx>{`
            body {
              background: hotpink;
            }
          `}</style>
        </body>
      </Html>
    );
  }
}
```

Examples of **correct** code for this rule:

```javascript
// pages/_document.js
import Document, { Html, Head, Main, NextScript } from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
```

## How to use

```json
{
  "rules": {
    "nextjs/no-styled-jsx-in-document": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-styled-jsx-in-document": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.3.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-styled-jsx-in-document)
