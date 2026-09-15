---
title: "unicorn/no-anonymous-default-export"
rule: "unicorn/no-anonymous-default-export"
category: "Restriction"
version: "0.3.3"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-anonymous-default-export.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallows anonymous functions and classes as default exports.

### Why is this bad?

Naming default exports improves searchability and ensures consistent
identifiers for a module’s default export in both declaration and import.

### Examples

Examples of **incorrect** code for this rule:

```javascript
export default class {}
export default function () {}
export default () => {};
module.exports = class {};
module.exports = function () {};
module.exports = () => {};
```

Examples of **correct** code for this rule:

```javascript
export default class Foo {}
export default function foo () {}

const foo = () => {};
export default foo;

module.exports = class Foo {};
module.exports = function foo () {};

const foo = () => {};
module.exports = foo;
```

## How to use

```json
{
  "rules": {
    "unicorn/no-anonymous-default-export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-anonymous-default-export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.3.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-anonymous-default-export.md)
