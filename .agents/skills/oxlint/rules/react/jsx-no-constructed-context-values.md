---
title: "react/jsx-no-constructed-context-values"
rule: "react/jsx-no-constructed-context-values"
category: "Perf"
version: "1.48.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-constructed-context-values.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows JSX context provider values from taking values that will cause needless rerenders.

### Why is this bad?

React Context and all its child nodes and Consumers are rerendered whenever the value prop
changes. Because each JavaScript object carries its own identity, things like object
expressions (`{foo: 'bar'}`) or function expressions get a new identity on every render.
This makes the context think it has gotten a new object and can cause needless rerenders
and unintended consequences.

This can be a large performance hit because not only will it cause the context providers
and consumers to rerender with all the elements in its subtree, the processing for the
tree scan React does to render the provider and find consumers is also wasted.

### Examples

Examples of **incorrect** code for this rule:

```jsx
return <SomeContext.Provider value={{ foo: "bar" }}>...</SomeContext.Provider>;
```

```jsx
function Component() {
  function foo() {}
  return <MyContext.Provider value={foo} />;
}
```

Examples of **correct** code for this rule:

```jsx
const foo = useMemo(() => ({ foo: "bar" }), []);
return <SomeContext.Provider value={foo}>...</SomeContext.Provider>;
```

```jsx
const MyContext = createContext();
const Component = () => <MyContext.Provider value="Some string" />;
```

## How to use

```json
{
  "rules": {
    "react/jsx-no-constructed-context-values": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/jsx-no-constructed-context-values": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.48.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-constructed-context-values.md)
