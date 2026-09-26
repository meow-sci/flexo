---
title: "node/callback-return"
rule: "node/callback-return"
category: "Style"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/callback-return.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require `return` statements after callbacks.

### Why is this bad?

This rule is aimed at ensuring that callbacks used outside of the main function block are always part-of or immediately preceding a `return` statement.
This rule decides what is a callback based on the name of the function being called.

### Examples

Examples of **incorrect** code for this rule:

```js
function done(err) {
  if (err) {
    callback(err);
  }
  callback();
}
```

Examples of **correct** code for this rule:

```js
function done(err) {
  if (err) {
    return callback(err);
  }
  callback();
}
```

### Known Limitations

Because it is difficult to understand the meaning of a program through static analysis, this rule has limitations:

- _false negatives_ when this rule reports correct code, but the program calls the callback more than one time (which is incorrect behavior)
- _false positives_ when this rule reports incorrect code, but the program calls the callback only one time (which is correct behavior)

#### Passing the callback by reference

The static analysis of this rule does not detect that the program calls the callback if it is an argument of a function (for example, `setTimeout`).

Example of a _false negative_ when this rule reports correct code:

```js
function foo(err, callback) {
  if (err) {
    setTimeout(callback, 0); // this is bad, but WILL NOT warn
  }
  callback();
}
```

#### Triggering the callback within a nested function

The static analysis of this rule does not detect that the program calls the callback from within a nested function or an immediately-invoked function expression (IIFE).

Example of a _false negative_ when this rule reports correct code:

```js
function foo(err, callback) {
  if (err) {
    process.nextTick(function () {
      return callback(); // this is bad, but WILL NOT warn
    });
  }
  callback();
}
```

#### If/else statements

The static analysis of this rule does not detect that the program calls the callback only one time in each branch of an `if` statement.

Example of a _false positive_ when this rule reports incorrect code:

```js
function foo(err, callback) {
  if (err) {
    callback(err); // this is fine, but WILL warn
  } else {
    callback(); // this is fine, but WILL warn
  }
}
```

## Configuration

The rule takes a single option - an array of possible callback names - which may include object methods. The default callback names are `callback`, `cb`, `next`.

type: `string[]`

default: `[]`

## How to use

```json
{
  "rules": {
    "node/callback-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "node/callback-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/callback-return.md)
