---
title: "eslint/no-shadow"
rule: "eslint/no-shadow"
category: "Suspicious"
version: "1.48.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-shadow"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows variable declarations from shadowing variables declared in the outer scope.

### Why is this bad?

Shadowing is the process by which a local variable shares the same name as a variable
in its containing scope. This can cause confusion, as it may be unclear which variable
is being referenced, and can lead to bugs that are difficult to diagnose.

### Examples

Examples of **incorrect** code for this rule:

```js
var x = 1;
function foo() {
  var x = 2; // x shadows the outer x
}
```

Examples of **correct** code for this rule:

```js
var x = 1;
function foo() {
  var y = 2; // different name, no shadowing
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `string[]`

default: `[]`

List of variable names that are allowed to shadow.

### builtinGlobals

type: `boolean`

default: `false`

Whether to report shadowing of built-in global variables.

### hoist

type: `"all" | "functions" | "functions-and-types" | "never" | "types"`

default: `"functions-and-types"`

Controls how hoisting is handled when checking for shadowing.

#### `"all"`

Report shadowing even before the outer variable is declared (due to hoisting).

#### `"functions"`

Only report shadowing for function declarations that are hoisted.

#### `"functions-and-types"`

Report shadowing for both function and type declarations that are hoisted.

#### `"never"`

Never report shadowing before the outer variable is declared.

#### `"types"`

Only report shadowing for type declarations that are hoisted.

### ignoreFunctionTypeParameterNameValueShadow

type: `boolean`

default: `true`

If `true`, ignore when a function type parameter shadows a value.
Example: `const T = 1; function foo<T>() {}`

### ignoreOnInitialization

type: `boolean`

default: `false`

Whether to ignore the variable initializers when the shadowed variable is presumably still uninitialized.

### ignoreTypeValueShadow

type: `boolean`

default: `true`

If `true`, ignore when a type and a value have the same name.
This is common in TypeScript: `type Foo = ...; const Foo = ...;`

## How to use

```json
{
  "rules": {
    "eslint/no-shadow": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-shadow": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.48.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-shadow)
