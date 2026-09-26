---
title: "react-perf/jsx-no-jsx-as-prop"
rule: "react-perf/jsx-no-jsx-as-prop"
category: "Perf"
version: "0.2.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/cvazac/eslint-plugin-react-perf/blob/master/docs/rules/jsx-no-jsx-as-prop.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevent JSX elements that are local to the current method from being
used as values of JSX props.

### Why is this bad?

Using locally defined JSX elements as values for props can lead to
unintentional re-renders and performance issues. Every time the parent
renders, a new instance of the JSX element is created, causing unnecessary
re-renders of child components. This also leads to harder-to-maintain code
as the component's props are not passed consistently.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<Item jsx={<SubItem />} />
<Item jsx={this.props.jsx || <SubItem />} />
<Item jsx={this.props.jsx ? this.props.jsx : <SubItem />} />
```

Examples of **correct** code for this rule:

```jsx
<Item callback={this.props.jsx} />
```

## How to use

```json
{
  "rules": {
    "react-perf/jsx-no-jsx-as-prop": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react-perf/jsx-no-jsx-as-prop": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.3.

## References

- [Upstream rule documentation](https://github.com/cvazac/eslint-plugin-react-perf/blob/master/docs/rules/jsx-no-jsx-as-prop.md)
