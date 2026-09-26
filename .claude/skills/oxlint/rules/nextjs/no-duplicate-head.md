---
title: "nextjs/no-duplicate-head"
rule: "nextjs/no-duplicate-head"
category: "Correctness"
version: "0.3.3"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-duplicate-head"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent duplicate usage of `<Head>` in `pages/_document.js`.

### Why is this bad?

This can cause unexpected behavior in your application.

### Examples

Examples of **incorrect** code for this rule:

```jsx
import Document, { Html, Head, Main, NextScript } from "next/document";
class MyDocument extends Document {
  static async getInitialProps(ctx) {}
  render() {
    return (
      <Html>
        <Head />
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
export default MyDocument;
```

Examples of **correct** code for this rule:

```jsx
import Document, { Html, Head, Main, NextScript } from "next/document";
class MyDocument extends Document {
  static async getInitialProps(ctx) {}
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
export default MyDocument;
```

## How to use

```json
{
  "rules": {
    "nextjs/no-duplicate-head": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-duplicate-head": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.3.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-duplicate-head)
