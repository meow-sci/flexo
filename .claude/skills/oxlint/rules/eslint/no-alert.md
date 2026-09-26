---
title: "eslint/no-alert"
rule: "eslint/no-alert"
category: "Restriction"
version: "0.9.3"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-alert"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow the use of `alert`, `confirm`, and `prompt`.

### Why is this bad?

JavaScript’s `alert`, `confirm`, and `prompt` functions are widely considered to be obtrusive as UI elements and should be replaced by a more appropriate custom UI implementation.
Furthermore, `alert` is often used while debugging code, which should be removed before deployment to production.

### Examples

Examples of **incorrect** code for this rule:

```js
alert("here!");

confirm("Are you sure?");

prompt("What's your name?", "John Doe");
```

Examples of **correct** code for this rule:

```js
customAlert("Something happened!");

customConfirm("Are you sure?");

customPrompt("Who are you?");

function foo() {
  var alert = myCustomLib.customAlert;
  alert();
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-alert": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-alert": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-alert)
