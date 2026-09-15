---
title: "react/no-clone-element"
rule: "react/no-clone-element"
category: "Restriction"
version: "1.53.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-clone-element.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the usage of `React.cloneElement`, which is considered an anti-pattern in React.

### Why is this bad?

It is recommended not to use `React.cloneElement` because it can lead to code that is
harder to follow and understand. It is generally uncommon and fragile, and there are various
alternatives recommended by
[the React documentation](https://react.dev/reference/react/cloneElement#alternatives).

Note that this rule is based on [`@eslint-react/no-clone-element`](https://www.eslint-react.xyz/docs/rules/no-clone-element)
from `@eslint-react`, not a rule from `eslint-plugin-react`.

### Examples

Examples of **incorrect** code for this rule:

```jsx
import { cloneElement } from "react";

function List({ children }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <div className="List">
      {Children.map(children, (child, index) =>
        cloneElement(child, {
          isHighlighted: index === selectedIndex,
        }),
      )}
    </div>
  );
}
```

Examples of **correct** code for this rule:

```jsx
// Using a map with a `renderItem` function prop instead.
function List({ items, renderItem }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <div className="List">
      {items.map((item, index) => {
        const isHighlighted = index === selectedIndex;
        return renderItem(item, isHighlighted);
      })}
    </div>
  );
}
```

## How to use

```json
{
  "rules": {
    "react/no-clone-element": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-clone-element": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.53.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-clone-element.md)
