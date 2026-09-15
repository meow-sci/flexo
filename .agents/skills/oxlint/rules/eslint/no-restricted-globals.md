---
title: "eslint/no-restricted-globals"
rule: "eslint/no-restricted-globals"
category: "Restriction"
version: "0.4.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-restricted-globals"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule allows you to specify global variable names that you don't want to use in your application.

### Why is this bad?

Disallowing usage of specific global variables can be useful if you want to allow a set of global
variables by enabling an environment, but still want to disallow some of those.

For instance, early Internet Explorer versions exposed the current DOM event as a global variable
`event`, but using this variable has been considered as a bad practice for a long time. Restricting
this will make sure this variable isn't used in browser code.

### Examples

If we have options:

```json
"no-restricted-globals": ["error", "event"]
```

The following patterns are considered problems:

```javascript
function onClick() {
  console.log(event); // Unexpected global variable 'event'. Use local parameter instead.
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### restrictedGlobals

type: `Record<string, string>`

default: `{}`

Objects in the format
`{ "name": "event", "message": "Use local parameter instead." }`, which define what globals
are restricted from use.

## How to use

```json
{
  "rules": {
    "eslint/no-restricted-globals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-restricted-globals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-restricted-globals)
