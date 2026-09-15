---
title: "react-perf/jsx-no-new-function-as-prop"
rule: "react-perf/jsx-no-new-function-as-prop"
category: "Perf"
version: "0.2.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/cvazac/eslint-plugin-react-perf/blob/master/docs/rules/jsx-no-new-function-as-prop.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent Functions that are local to the current method from being used
as values of JSX props.

### Why is this bad?

Using locally defined Functions as values for props can lead to unintentional
re-renders and performance issues. Every time the parent component renders,
a new instance of the Function is created, causing unnecessary re-renders
of child components. This also leads to harder-to-maintain code as the
component's props are not passed consistently.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<Item callback={new Function(...)} />
<Item callback={this.props.callback || function() {}} />
```

Examples of **correct** code for this rule:

```jsx
<Item callback={this.props.callback} />
```

## How to use

```json
{
  "rules": {
    "react-perf/jsx-no-new-function-as-prop": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react-perf/jsx-no-new-function-as-prop": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.3.

## References

- [Upstream rule documentation](https://github.com/cvazac/eslint-plugin-react-perf/blob/master/docs/rules/jsx-no-new-function-as-prop.md)
