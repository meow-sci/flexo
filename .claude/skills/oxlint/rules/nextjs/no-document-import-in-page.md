---
title: "nextjs/no-document-import-in-page"
rule: "nextjs/no-document-import-in-page"
category: "Correctness"
version: "0.2.1"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-document-import-in-page"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent importing `next/document` outside of `pages/_document.js`.

### Why is this bad?

Importing `next/document` outside of `pages/_document.js` can cause
unexpected issues in your Next.js application.

### Examples

Examples of **incorrect** code for this rule:

```jsx
// `components/MyDocument.jsx`
import Document from "next/document";

class MyDocument extends Document {
  //...
}

export default MyDocument;
```

Examples of **correct** code for this rule:

```jsx
// `pages/_document.jsx`
import Document from "next/document";

class MyDocument extends Document {
  //...
}

export default MyDocument;
```

## How to use

```json
{
  "rules": {
    "nextjs/no-document-import-in-page": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-document-import-in-page": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.1.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-document-import-in-page)
