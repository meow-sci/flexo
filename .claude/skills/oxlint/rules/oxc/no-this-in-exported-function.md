---
title: "oxc/no-this-in-exported-function"
rule: "oxc/no-this-in-exported-function"
category: "Suspicious"
version: "1.33.0"
default: false
type_aware: false
fix: "none"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows the use of `this` in exported functions.

### Why is this bad?

In most bundlers, the value of `this` is not preserved for exported functions.
When a function is exported and imported in another module, `this` typically
becomes `undefined` instead of the module namespace object. This can lead to
unexpected runtime errors or incorrect behavior.

### Examples

Examples of **incorrect** code for this rule:

```javascript
export function foo() {
  console.log(this);
}

export default function bar() {
  this.something();
}

function baz() {
  const self = this;
}
export { baz };
```

Examples of **correct** code for this rule:

```javascript
function foo() {
  console.log(this);
}

export const bar = () => {
  console.log(this);
};
```

## How to use

```json
{
  "rules": {
    "oxc/no-this-in-exported-function": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/no-this-in-exported-function": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

