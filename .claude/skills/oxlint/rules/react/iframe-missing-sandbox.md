---
title: "react/iframe-missing-sandbox"
rule: "react/iframe-missing-sandbox"
category: "Suspicious"
version: "0.10.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/iframe-missing-sandbox.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforce sandbox attribute on iframe elements.

### Why is this bad?

The sandbox attribute enables an extra set of restrictions for the
content in the iframe. Using sandbox attribute is considered a good
security practice. To learn more about sandboxing, see [MDN's
documentation on the `sandbox`
attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox).

This rule checks all React `<iframe>` elements and verifies that there
is `sandbox` attribute and that it's value is valid. In addition to that
it also reports cases where attribute contains `allow-scripts` and
`allow-same-origin` at the same time as this combination allows the
embedded document to remove the sandbox attribute and bypass the
restrictions.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<iframe />;
<iframe sandbox="invalid-value" />;
<iframe sandbox="allow-same-origin allow-scripts" />;
```

Examples of **correct** code for this rule:

```jsx
<iframe sandbox="" />;
<iframe sandbox="allow-origin" />;
```

## How to use

```json
{
  "rules": {
    "react/iframe-missing-sandbox": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/iframe-missing-sandbox": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.10.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/iframe-missing-sandbox.md)
