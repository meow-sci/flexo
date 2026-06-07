---
title: "eslint/no-useless-assignment"
rule: "eslint/no-useless-assignment"
category: "Nursery"
version: "1.59.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-useless-assignment"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Flags assignments where the newly assigned value is never read afterward (a "dead store"). This helps catch wasted work or accidental mistakes.

### Why is this bad?

Dead stores add noise and can hide real bugs (e.g., you meant to use that value or wrote to the wrong variable). Removing them improves clarity and performance.

### Examples

Examples of **incorrect** code for this rule:

```js
/* eslint no-useless-assignment: "error" */

function fn1() {
  let v = "used";
  doSomething(v);
  v = "unused"; // assigned but never read
}

function fn2() {
  let v = "used";
  if (condition) {
    v = "unused"; // early return; this write is never observed
    return;
  }
  doSomething(v);
}

function fn3() {
  let v = "used";
  if (condition) {
    doSomething(v);
  } else {
    v = "unused"; // value not used later in this branch
  }
}
```

Examples of **correct** code for this rule:

```js
function fn1() {
  let v = "used";
  doSomething(v);
  v = "used-2";
  doSomething(v); // the reassigned value is read
}

function fn2() {
  let v = "used";
  if (condition) {
    v = "used-2";
    doSomething(v); // reassignment is observed before returning
    return;
  }
  doSomething(v);
}

function fn3() {
  let v = "used";
  for (let i = 0; i < 10; i++) {
    doSomething(v);
    v = "used in next iteration"; // used on the next loop pass
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-assignment": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-assignment": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-assignment)
