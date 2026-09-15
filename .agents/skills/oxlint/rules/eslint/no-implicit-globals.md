---
title: "eslint/no-implicit-globals"
rule: "eslint/no-implicit-globals"
category: "Restriction"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-implicit-globals"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows declarations in the global scope, global variable leaks, and
writes or redeclarations of read-only globals.

### Why is this bad?

Browser scripts share a global scope. Top-level `var` and `function`
declarations, and assignments to undeclared variables in sloppy mode,
create globals that can collide with other scripts.

### Examples

Examples of **incorrect** code for this rule:

```js
var foo = 1;
function bar() {}
baz = 1;
```

Examples of **correct** code for this rule:

```js
window.foo = 1;
(function () {
  var bar = 1;
})();
```

## Configuration

### lexicalBindings

type: `boolean`

default: `false`

## How to use

```json
{
  "rules": {
    "eslint/no-implicit-globals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-implicit-globals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-implicit-globals)
