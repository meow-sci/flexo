---
title: "nextjs/no-head-import-in-document"
rule: "nextjs/no-head-import-in-document"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-head-import-in-document"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the usage of `next/head` inside a Next.js document.

### Why is this bad?

Importing `next/head` inside `pages/_document.js` can cause
unexpected issues in your Next.js application.

### Examples

Examples of **incorrect** code for this rule:

```jsx
import Document, { Html, Main, NextScript } from "next/document";
import Head from "next/head";

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    //...
  }

  render() {
    return (
      <Html>
        <Head></Head>
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
  static async getInitialProps(ctx) {
    //...
  }

  render() {
    return (
      <Html>
        <Head></Head>
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
    "nextjs/no-head-import-in-document": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-head-import-in-document": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-head-import-in-document)
