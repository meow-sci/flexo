---
title: "unicorn/no-useless-iterator-to-array"
rule: "unicorn/no-useless-iterator-to-array"
category: "Nursery"
version: "1.59.0"
default: false
type_aware: false
fix: "fixable_safe_fix_or_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-iterator-to-array.md"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | fixable_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

Disallow unnecessary `.toArray()` on iterators.

### Why is this bad?

[`Iterator.prototype.toArray()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator/toArray)
converts an iterator to an array. However, this conversion is unnecessary in many cases:

- The following builtins accept an iterable directly:
  - `Map` constructor
  - `WeakMap` constructor
  - `Set` constructor
  - `WeakSet` constructor
  - `TypedArray` constructor
  - `Array.from(…)`
  - `TypedArray.from(…)`
  - `Object.fromEntries(…)`
- `for…of` can iterate over any iterable, so converting to an array first is unnecessary.
- `yield*` can delegate to any iterable, so converting to an array first is unnecessary.
- `Promise.{all,allSettled,any,race}(…)` accept an iterable, so `.toArray()` is unnecessary.
  Removing `.toArray()` here can change a synchronous throw into an asynchronous rejection
  when iteration fails, so these cases are suggestions rather than autofixes.
- The spread operator (`...`) works on any iterable, so converting to an array first is unnecessary.
- Some `Array` methods also exist on `Iterator`, so converting to an array to call them is unnecessary:
  - `.every()`
  - `.find()`
  - `.forEach()`
  - `.reduce()`
  - `.some()`

`Array` callbacks receive additional arguments (for example, the 3rd `array` argument)
that `Iterator` callbacks do not. Removing `.toArray()` can change behavior if callbacks
depend on those extra arguments, so those cases are reported as suggestions.

This rule does not flag `.filter()`, `.map()`, or `.flatMap()` because their `Iterator`
versions return iterators, not arrays, so the semantics differ.

### Examples

Examples of **incorrect** code for this rule:

```js
const set = new Set(iterator.toArray());

const results = await Promise.all(iterator.toArray());

for (const item of iterator.toArray());

function* foo() {
  yield* iterator.toArray();
}

const items = [...iterator.toArray()];

call(...iterator.toArray());

iterator.toArray().every(fn);
```

Examples of **correct** code for this rule:

```js
const set = new Set(iterator);

const results = await Promise.all(iterator);

for (const item of iterator);

function * foo() {
	yield * iterator;
}

const items = [...iterator];

call(...iterator);

iterator.every(fn);

`.filter()` returns an array on Array but an iterator on Iterator
iterator.toArray().filter(fn);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-iterator-to-array": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-iterator-to-array": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-iterator-to-array.md)
