---
title: "eslint/vars-on-top"
rule: "eslint/vars-on-top"
category: "Style"
version: "0.15.4"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/vars-on-top"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that all `var` declarations are placed at the top of their containing scope.

### Why is this bad?

In JavaScript, `var` declarations are hoisted to the top of their containing scope. Placing `var` declarations at the top explicitly improves code readability and maintainability by making the scope of variables clear.

### Examples

Examples of **incorrect** code for this rule:

```js
function doSomething() {
  if (true) {
    var first = true;
  }
  var second;
}

function doSomethingElse() {
  for (var i = 0; i < 10; i++) {}
}

f();
var a;

class C {
  static {
    if (something) {
      var a = true;
    }
  }
  static {
    f();
    var a;
  }
}
```

Examples of **correct** code for this rule:

```js
function doSomething() {
  var first;
  var second;
  if (true) {
    first = true;
  }
}

function doSomethingElse() {
  var i;
  for (i = 0; i < 10; i++) {}
}

var a;
f();

class C {
  static {
    var a;
    if (something) {
      a = true;
    }
  }
  static {
    var a;
    f();
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/vars-on-top": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/vars-on-top": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/vars-on-top)
