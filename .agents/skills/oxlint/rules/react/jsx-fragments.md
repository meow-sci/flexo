---
title: "react/jsx-fragments"
rule: "react/jsx-fragments"
category: "Style"
version: "1.12.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-fragments.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces the shorthand or standard form for React Fragments.

### Why is this bad?

Makes code using fragments more consistent one way or the other.

## Configuration

This rule accepts one of the following string values:

### `"syntax"`

This is the default mode. It will enforce the shorthand syntax for React fragments, with one exception.
Keys or attributes are not supported by the shorthand syntax, so the rule will not warn on standard-form fragments that use those.

Examples of **incorrect** code for this rule:

```jsx
<React.Fragment>
  <Foo />
</React.Fragment>
```

Examples of **correct** code for this rule:

```jsx
<>
  <Foo />
</>
```

```jsx
<React.Fragment key="key">
  <Foo />
</React.Fragment>
```

### `"element"`

This mode enforces the standard form for React fragments.

Examples of **incorrect** code for this rule:

```jsx
<>
  <Foo />
</>
```

Examples of **correct** code for this rule:

```jsx
<React.Fragment>
  <Foo />
</React.Fragment>
```

```jsx
<React.Fragment key="key">
  <Foo />
</React.Fragment>
```

## How to use

```json
{
  "rules": {
    "react/jsx-fragments": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/jsx-fragments": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-fragments.md)
