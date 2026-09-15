---
title: "eslint/no-import-assign"
rule: "eslint/no-import-assign"
category: "Correctness"
version: "0.0.5"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-import-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow assigning to imported bindings.

### Why is this bad?

The updates of imported bindings by ES Modules cause runtime errors.

The TypeScript compiler generally enforces this check already. Although
it should be noted that there are some cases TypeScript does not catch, such
as assignments via `Object.assign`. So this rule is still useful for
TypeScript code in those cases.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import mod, { named } from "./mod.mjs";
import * as mod_ns from "./mod.mjs";

mod = 1; // ERROR: 'mod' is readonly.
named = 2; // ERROR: 'named' is readonly.
mod_ns.named = 3; // ERROR: The members of 'mod_ns' are readonly.
mod_ns = {}; // ERROR: 'mod_ns' is readonly.
// Can't extend 'mod_ns'
Object.assign(mod_ns, { foo: "foo" }); // ERROR: The members of 'mod_ns' are readonly.
```

## How to use

```json
{
  "rules": {
    "eslint/no-import-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-import-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-import-assign)
