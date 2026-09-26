---
title: "eslint/prefer-const"
rule: "eslint/prefer-const"
category: "Style"
version: "1.43.0"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/prefer-const"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Requires `const` declarations for variables that are never
reassigned after their initial declaration.

### Why is this bad?

If a variable is never reassigned, using the `const` declaration is better.
`const` declaration tells readers, "this variable is never reassigned," reducing cognitive load and improving maintainability.

### Examples

Examples of **incorrect** code for this rule:

```js
let a = 3;
console.log(a);

let b;
b = 0;
console.log(b);

for (let i in [1, 2, 3]) {
  console.log(i);
}
```

Examples of **correct** code for this rule:

```js
const a = 0;

let a;
a = 0;
a = 1;

let a;
if (true) {
  a = 0;
}

for (const i in [1, 2, 3]) {
  console.log(i);
}
```

## Configuration

### destructuring

type: `"any" | "all"`

Configures how destructuring assignments are handled.

#### `"any"`

Warn if any of the variables in a destructuring assignment should be `const`.

#### `"all"`

Only warn if all variables in a destructuring assignment should be `const`. Otherwise, ignore them.

### ignoreReadBeforeAssign

type: `boolean`

default: `false`

If `true`, the rule will not report variables that are read before their initial assignment.
This is mainly useful for preventing conflicts with the `typescript/no-use-before-define` rule.

## How to use

```json
{
  "rules": {
    "eslint/prefer-const": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-const": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.43.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-const)
