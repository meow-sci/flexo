---
title: "nextjs/google-font-display"
rule: "nextjs/google-font-display"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/google-font-display"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce font-display behavior with Google Fonts.

### Why is this bad?

Specifying display=optional minimizes the risk of invisible text or
layout shift. If swapping to the custom font after it has loaded is
important to you, then use `display=swap`` instead.

### Examples

Examples of **incorrect** code for this rule:

```jsx
import Head from "next/head";

export default Test = () => {
  return (
    <Head>
      <link href="https://fonts.googleapis.com/css2?family=Krona+One" rel="stylesheet" />
    </Head>
  );
};
```

Examples of **correct** code for this rule:

```jsx
import Head from "next/head";

export default Test = () => {
  return (
    <Head>
      <link
        href="https://fonts.googleapis.com/css2?family=Krona+One&display=optional"
        rel="stylesheet"
      />
    </Head>
  );
};
```

## How to use

```json
{
  "rules": {
    "nextjs/google-font-display": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/google-font-display": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/google-font-display)
