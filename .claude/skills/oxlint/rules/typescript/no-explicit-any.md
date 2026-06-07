---
title: "typescript/no-explicit-any"
rule: "typescript/no-explicit-any"
category: "Restriction"
version: "0.0.13"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://typescript-eslint.io/rules/no-explicit-any/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallows explicit use of the `any` type.

### Why is this bad?

The `any` type in TypeScript is a dangerous "escape hatch" from the type system. Using
`any` disables many type checking rules and is generally best used only as a last resort or
when prototyping code. This rule reports on explicit uses of the `any` keyword as a type
annotation.

> TypeScript's `--noImplicitAny` compiler option prevents an implied `any`, but doesn't
> prevent `any` from being explicitly used the way this rule does.

### Examples

Examples of **incorrect** code for this rule:

```typescript
const age: any = "seventeen";
const ages: any[] = ["seventeen"];
const ages: Array<any> = ["seventeen"];
function greet(): any {}
function greet(): any[] {}
function greet(): Array<any> {}
function greet(): Array<Array<any>> {}
function greet(param: Array<any>): string {}
function greet(param: Array<any>): Array<any> {}
```

Examples of **correct** code for this rule:

```typescript
const age: number = 17;
const ages: number[] = [17];
const ages: Array<number> = [17];
function greet(): string {}
function greet(): string[] {}
function greet(): Array<string> {}
function greet(): Array<Array<string>> {}
function greet(param: Array<string>): string {}
function greet(param: Array<string>): Array<string> {}
```

## Configuration

This rule accepts a configuration object with the following properties:

### fixToUnknown

type: `boolean`

default: `false`

Whether to enable auto-fixing in which the `any` type is converted to the `unknown` type.

### ignoreRestArgs

type: `boolean`

default: `false`

Whether to ignore rest parameter arrays.

## How to use

```json
{
  "rules": {
    "typescript/no-explicit-any": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-explicit-any": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-explicit-any/)
