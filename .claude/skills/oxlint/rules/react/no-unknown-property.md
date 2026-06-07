---
title: "react/no-unknown-property"
rule: "react/no-unknown-property"
category: "Restriction"
version: "0.2.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unknown-property.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow usage of unknown DOM properties.

### Why is this bad?

DOM properties should only be used if they are valid for a given HTML element.

### Examples

Examples of **incorrect** code for this rule:

```jsx
// Unknown properties
const Hello = <div class="hello">Hello World</div>;
const Alphabet = <div abc="something">Alphabet</div>;

// Invalid aria-* attribute
const IconButton = <div aria-foo="bar" />;
```

Examples of **correct** code for this rule:

```jsx
// Unknown properties
const Hello = <div className="hello">Hello World</div>;
const Alphabet = <div>Alphabet</div>;

// Invalid aria-* attribute
const IconButton = <div aria-label="bar" />;
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignore

type: `string[]`

default: `[]`

List of properties to ignore.

### requireDataLowercase

type: `boolean`

default: `false`

Require `data-*` attributes to be lowercase, e.g. `data-foobar` instead of `data-fooBar`.

## How to use

```json
{
  "rules": {
    "react/no-unknown-property": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-unknown-property": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unknown-property.md)
