---
title: "nextjs/no-head-element"
rule: "nextjs/no-head-element"
category: "Correctness"
version: "0.2.1"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-head-element"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the usage of the native `<head>` element inside a Next.js application.

### Why is this bad?

A `<head>` element can cause unexpected behavior in a Next.js application.
Use Next.js' built-in `next/head` component instead.

### Examples

Examples of **incorrect** code for this rule:

```jsx
function Index() {
  return (
    <>
      <head>
        <title>My page title</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </head>
    </>
  );
}

export default Index;
```

Examples of **correct** code for this rule:

```jsx
import Head from "next/head";

function Index() {
  return (
    <>
      <Head>
        <title>My page title</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
    </>
  );
}

export default Index;
```

## How to use

```json
{
  "rules": {
    "nextjs/no-head-element": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-head-element": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.1.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-head-element)
