---
title: "react/hook-use-state"
rule: "react/hook-use-state"
category: "Style"
version: "1.59.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/hook-use-state.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Ensure destructuring and symmetric naming of useState hook value and setter variables.

### Why is this bad?

This rule checks whether the value and setter variables destructured from a React.useState() call are named symmetrically

### Examples

Examples of **incorrect** code for this rule:

```jsx
import React from "react";
export default function useColor() {
  // useState call is not destructured into value + setter pair
  const useStateResult = React.useState();
  return useStateResult;
}
```

```jsx
import React from "react";
export default function useColor() {
  // useState call is destructured into value + setter pair, but identifier
  // names do not follow the [thing, setThing] naming convention
  const [color, updateColor] = React.useState();
  return [color, updateColor];
}
```

Examples of **correct** code for this rule:

```jsx
import React from "react";
export default function useColor() {
  // useState call is destructured into value + setter pair whose identifiers
  // follow the [thing, setThing] naming convention
  const [color, setColor] = React.useState();
  return [color, setColor];
}
```

## Configuration

### allowDestructuredState

type: `boolean`

default: `false`

When true the rule will ignore the name of the destructured value.

## How to use

```json
{
  "rules": {
    "react/hook-use-state": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/hook-use-state": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/hook-use-state.md)
