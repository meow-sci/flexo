---
title: "nextjs/no-script-component-in-head"
rule: "nextjs/no-script-component-in-head"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-script-component-in-head"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent usage of `next/script` in `next/head` component.

### Why is this bad?

The `next/script` component should not be used in a `next/head` component.
Instead move the `<Script />` component outside of `<Head>` instead.

### Examples

Examples of **incorrect** code for this rule:

```jsx
import Script from "next/script";
import Head from "next/head";

export default function Index() {
  return (
    <Head>
      <title>Next.js</title>
      <Script src="/my-script.js" />
    </Head>
  );
}
```

Examples of **correct** code for this rule:

```jsx
import Script from "next/script";
import Head from "next/head";

export default function Index() {
  return (
    <>
      <Head>
        <title>Next.js</title>
      </Head>
      <Script src="/my-script.js" />
    </>
  );
}
```

## How to use

```json
{
  "rules": {
    "nextjs/no-script-component-in-head": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-script-component-in-head": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-script-component-in-head)
