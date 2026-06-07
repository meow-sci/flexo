---
title: "unicorn/no-useless-spread"
rule: "unicorn/no-useless-spread"
category: "Correctness"
version: "0.0.19"
default: true
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-spread.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Disallows using spread syntax in following, unnecessary cases:

- Spread an array literal as elements of an array literal
- Spread an array literal as arguments of a call or a `new` call
- Spread an object literal as properties of an object literal
- Use spread syntax to clone an array created inline

### Why is this bad?

The following builtins accept an iterable, so it's unnecessary to
convert the iterable to an array:

- `Map` constructor
- `WeakMap` constructor
- `Set` constructor
- `WeakSet` constructor
- `TypedArray` constructor
- `Array.from(…)`
- `TypedArray.from(…)`
- `Promise.{all,allSettled,any,race}(…)`
- `Object.fromEntries(…)`

The `for…of` loop can iterate over any iterable object not just array,
so it's unnecessary to convert the iterable to an array.

The `yield*` can delegate to another iterable, so it's unnecessary to
convert the iterable to an array.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const array = [firstElement, ...[secondElement], thirdElement];

await Promise.all([...iterable]);

for (const foo of [...set]);

function* foo() {
  yield* [...anotherGenerator()];
}

function foo(bar) {
  return [...bar.map((x) => x * 2)];
}
```

Examples of **correct** code for this rule:

```javascript
const array = [firstElement, secondElement, thirdElement];

await Promise.all(iterable);

for (const foo of set);

function* foo() {
  yield* anotherGenerator();
}

function foo(bar) {
  return bar.map((x) => x * 2);
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-spread": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-spread": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-spread.md)
