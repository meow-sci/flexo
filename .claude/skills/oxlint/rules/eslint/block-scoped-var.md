---
title: "eslint/block-scoped-var"
rule: "eslint/block-scoped-var"
category: "Suspicious"
version: "0.16.9"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/block-scoped-var"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that variables are both **declared** and **used** within the same block scope.
This rule prevents accidental use of variables outside their intended block, mimicking C-style block scoping in JavaScript.

### Why is this bad?

JavaScript’s `var` declarations are hoisted to the top of their enclosing function, which can cause variables declared in a block (e.g., inside an `if` or `for`) to be accessible outside of it.
This can lead to hard-to-find bugs.
By enforcing block scoping, this rule helps avoid hoisting issues and aligns more closely with how other languages treat block variables.

### Examples

Examples of **incorrect** code for this rule:

```js
/* block-scoped-var: "error" */

function doIf() {
  if (true) {
    var build = true;
  }
  console.log(build);
}

function doLoop() {
  for (var i = 0; i < 10; i++) {
    // do something
  }
  console.log(i); // i is accessible here
}

function doSomething() {
  if (true) {
    var foo = 1;
  }
  if (false) {
    foo = 2;
  }
}

function doTry() {
  try {
    var foo = 1;
  } catch (e) {
    console.log(foo);
  }
}
```

Examples of **correct** code for this rule:

```js
/* block-scoped-var: "error" */

function doIf() {
  var build;
  if (true) {
    build = true;
  }
  console.log(build);
}

function doLoop() {
  var i;
  for (i = 0; i < 10; i++) {
    // do something
  }
  console.log(i);
}

function doSomething() {
  var foo;
  if (true) {
    foo = 1;
  }
  if (false) {
    foo = 2;
  }
}

function doTry() {
  var foo;
  try {
    foo = 1;
  } catch (e) {
    console.log(foo);
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/block-scoped-var": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/block-scoped-var": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.9.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/block-scoped-var)
