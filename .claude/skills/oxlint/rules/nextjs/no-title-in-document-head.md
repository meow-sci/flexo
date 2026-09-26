---
title: "nextjs/no-title-in-document-head"
rule: "nextjs/no-title-in-document-head"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-title-in-document-head"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent usage of `<title>` with `Head` component from `next/document`.

### Why is this bad?

A `<title>` element should only be used for any `<head>` code that is common for all pages.
Title tags should be defined at the page-level using `next/head` instead.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import { Head } from "next/document";

export function Home() {
  return (
    <div>
      <Head>
        <title>My page title</title>
      </Head>
    </div>
  );
}
```

Examples of **correct** code for this rule:

```javascript
import Head from "next/head";

export function Home() {
  return (
    <div>
      <Head>
        <title>My page title</title>
      </Head>
    </div>
  );
}
```

## How to use

```json
{
  "rules": {
    "nextjs/no-title-in-document-head": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-title-in-document-head": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-title-in-document-head)
