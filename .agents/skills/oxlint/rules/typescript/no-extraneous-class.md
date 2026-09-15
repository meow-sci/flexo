---
title: "typescript/no-extraneous-class"
rule: "typescript/no-extraneous-class"
category: "Suspicious"
version: "0.7.0"
default: false
type_aware: false
fix: "fixable_dangerous_suggestion"
upstream: "https://typescript-eslint.io/rules/no-extraneous-class/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_dangerous_suggestion |
| Type-aware | no |


### What it does

This rule reports when a class has no non-static members, such as for a
class used exclusively as a static namespace. This rule also reports
classes that have only a constructor and no fields. Those classes can
generally be replaced with a standalone function.

### Why is this bad?

Users who come from a OOP paradigm may wrap their utility functions in
an extra class, instead of putting them at the top level of an
ECMAScript module. Doing so is generally unnecessary in JavaScript and
TypeScript projects.

- Wrapper classes add extra cognitive complexity to code without adding
  any structural improvements
  - Whatever would be put on them, such as utility functions, are already
    organized by virtue of being in a module.
  - As an alternative, you can `import * as ...` the module to get all of them
    in a single object.
- IDEs can't provide as good suggestions for static class or namespace
  imported properties when you start typing property names
- It's more difficult to statically analyze code for unused variables,
  etc. when they're all on the class (see: [Finding dead code (and dead
  types) in TypeScript](https://effectivetypescript.com/2020/10/20/tsprune/)).

This rule also reports classes that have only a constructor and no
fields. Those classes can generally be replaced with a standalone
function.

### Examples

Examples of **incorrect** code for this rule:

```ts
class StaticConstants {
  static readonly version = 42;

  static isProduction() {
    return process.env.NODE_ENV === "production";
  }
}

class HelloWorldLogger {
  constructor() {
    console.log("Hello, world!");
  }
}

abstract class Foo {}
```

Examples of **correct** code for this rule:

```ts
const version = 42;
const isProduction = () => process.env.NODE_ENV === "production";
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowConstructorOnly

type: `boolean`

default: `false`

Allow classes that only have a constructor.

### allowEmpty

type: `boolean`

default: `false`

Allow empty classes.

### allowStaticOnly

type: `boolean`

default: `false`

Allow classes with only static members.

### allowWithDecorator

type: `boolean`

default: `false`

Allow classes with decorators.

## How to use

```json
{
  "rules": {
    "typescript/no-extraneous-class": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-extraneous-class": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-extraneous-class/)
