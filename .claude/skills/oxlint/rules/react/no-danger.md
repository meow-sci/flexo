---
title: "react/no-danger"
rule: "react/no-danger"
category: "Restriction"
version: "0.0.14"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-danger.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule prevents the use of `dangerouslySetInnerHTML` prop.

### Why is this bad?

`dangerouslySetInnerHTML` is a way to inject HTML into your React
component. This is dangerous because it can easily lead to XSS
vulnerabilities.

### Examples

Examples of **incorrect** code for this rule:

```jsx
import React from "react";

const Hello = <div dangerouslySetInnerHTML={{ __html: "Hello World" }}></div>;
```

Examples of **correct** code for this rule:

```jsx
import React from "react";

const Hello = <div>Hello World</div>;
```

## How to use

```json
{
  "rules": {
    "react/no-danger": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-danger": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-danger.md)
