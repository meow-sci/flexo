---
title: "react/forbid-elements"
rule: "react/forbid-elements"
category: "Restriction"
version: "0.16.11"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/forbid-elements.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Allows you to configure a list of forbidden elements and to specify their desired replacements.

### Why is this bad?

You may want to forbid usage of certain elements in favor of others, e.g.
forbid all `<div />` and use `<Box />` instead.

### Examples

Examples of **incorrect** code for this rule:

```jsx
// ["error", { "forbid": ["button"] }]
<button />;
React.createElement("button");

// ["error", { "forbid": ["Modal"] }]
<Modal />;
React.createElement(Modal);

// ["error", { "forbid": ["Namespaced.Element"] }]
<Namespaced.Element />;
React.createElement(Namespaced.Element);

// ["error", { "forbid": [{ "element": "button", "message": "use <Button> instead" }, "input"] }]
<div>
  <button />
  <input />
</div>;
React.createElement("div", {}, React.createElement("button", {}, React.createElement("input")));
```

Examples of **correct** code for this rule:

```jsx
// ["error", { "forbid": ["button"] }]
<Button />

// ["error", { "forbid": [{ "element": "button" }] }]
<Button />
```

## Configuration

This rule accepts a configuration object with the following properties:

### forbid

type: `array`

List of forbidden elements, with optional messages for display with lint violations.

Examples:

- `["error, { "forbid": ["button"] }]`
- `["error, { "forbid": [{ "element": "button", "message": "Use <Button> instead." }] }]`
- `["error, { "forbid": [{ "element": "input" }] }]`

#### forbid[n]

type: `object | string`

A forbidden element, either as a plain element name or with a custom message.

##### forbid[n].element

type: `string`

The element name to forbid.

##### forbid[n].message

type: `string`

The message to display when this element is found

## How to use

```json
{
  "rules": {
    "react/forbid-elements": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/forbid-elements": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.11.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/forbid-elements.md)
