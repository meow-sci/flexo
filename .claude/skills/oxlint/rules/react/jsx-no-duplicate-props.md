---
title: "react/jsx-no-duplicate-props"
rule: "react/jsx-no-duplicate-props"
category: "Correctness"
version: "0.0.14"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-duplicate-props.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule prevents duplicate props in JSX elements.

### Why is this bad?

Having duplicate props in a JSX element is most likely a mistake.
Creating JSX elements with duplicate props can cause unexpected behavior in your application.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<App a a />;
<App foo={2} bar baz foo={3} />;
```

Examples of **correct** code for this rule:

```jsx
<App a />;
<App bar baz foo={3} />;
```

### Differences from eslint-plugin-react

This rule does not support the `ignoreCase` option. Props with different cases are
considered distinct and will not be flagged as duplicates (e.g., `<App foo Foo />`
is allowed). This is intentional, as props are case-sensitive in JSX.

## How to use

```json
{
  "rules": {
    "react/jsx-no-duplicate-props": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/jsx-no-duplicate-props": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-duplicate-props.md)
