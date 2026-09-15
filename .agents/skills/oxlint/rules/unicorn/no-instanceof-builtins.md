---
title: "unicorn/no-instanceof-builtins"
rule: "unicorn/no-instanceof-builtins"
category: "Suspicious"
version: "0.16.12"
default: false
type_aware: false
fix: "conditional_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-instanceof-builtins.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 💡 conditional suggestion |
| Type-aware | no |


### What it does

Disallows the use of `instanceof` with ECMAScript built-in constructors because:

- it breaks across execution contexts (`iframe`, Web Worker, Node VM, etc.);
- it is often misleading (e.g. `instanceof Array` fails for a subclass);
- there is always a clearer and safer alternative (`Array.isArray`, `typeof`, `Buffer.isBuffer`, …).

### Why is this bad?

`instanceof` breaks across execution contexts (`iframe`, Web Worker, Node `vm`),
and may give misleading results for subclasses or exotic objects.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (arr instanceof Array) { … }
if (el instanceof HTMLElement) { … }
```

Examples of **correct** code for this rule:

```javascript
if (Array.isArray(arr)) { … }
if (el?.nodeType === 1) { … }
```

## Configuration

This rule accepts a configuration object with the following properties:

### exclude

type: `string[]`

default: `[]`

Constructor names to exclude from checking.

### include

type: `string[]`

default: `[]`

Additional constructor names to check beyond the default set.
Use this to extend the rule with additional constructors.

### strategy

type: `"strict" | "loose"`

default: `"loose"`

Controls which built-in constructors are checked.

#### `"strict"`

Additionally checks Error types, collections, typed arrays, and other built-in constructors.

#### `"loose"`

Only checks Array, Function, Error (if `useErrorIsError` is true), and primitive wrappers.

### useErrorIsError

type: `boolean`

default: `false`

When `true`, checks `instanceof Error` and suggests using `Error.isError()` instead.
Requires [the `Error.isError()` function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError)
to be available.

## How to use

```json
{
  "rules": {
    "unicorn/no-instanceof-builtins": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-instanceof-builtins": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-instanceof-builtins.md)
