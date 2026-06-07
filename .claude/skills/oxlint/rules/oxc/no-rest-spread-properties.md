---
title: "oxc/no-rest-spread-properties"
rule: "oxc/no-rest-spread-properties"
category: "Restriction"
version: "0.4.2"
default: false
type_aware: false
fix: "none"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow [Object Rest/Spread Properties](https://github.com/tc39/proposal-object-rest-spread#readme).

### Why is this bad?

Object rest/spread properties are a relatively new JavaScript feature that may
not be supported in all target environments. If you need to support older
browsers or JavaScript engines that don't support these features, using them
can cause runtime errors. This rule helps maintain compatibility with older
environments by preventing the use of these modern syntax features.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let { x, ...y } = z;
let z = { x, ...y };
```

## Configuration

This rule accepts a configuration object with the following properties:

### objectRestMessage

type: `string`

default: `""`

A message to display when object rest properties are found.

### objectSpreadMessage

type: `string`

default: `""`

A message to display when object spread properties are found.

## How to use

```json
{
  "rules": {
    "oxc/no-rest-spread-properties": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/no-rest-spread-properties": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

