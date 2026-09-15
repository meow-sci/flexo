---
title: "eslint/no-control-regex"
rule: "eslint/no-control-regex"
category: "Correctness"
version: "0.0.7"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-control-regex"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallows control characters and some escape sequences that match
control characters in regular expressions.

### Why is this bad?

Control characters are special, invisible characters in the ASCII range
0-31. These characters are rarely used in JavaScript strings so a
regular expression containing elements that explicitly match these
characters is most likely a mistake.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var pattern1 = /\x00/;
var pattern2 = /\x0C/;
var pattern3 = /\x1F/;
var pattern4 = /\u000C/;
var pattern5 = /\u{C}/u;
var pattern6 = new RegExp("\x0C"); // raw U+000C character in the pattern
var pattern7 = new RegExp("\\x0C"); // \x0C pattern
```

Examples of **correct** code for this rule:

```javascript
var pattern1 = /\x20/;
var pattern2 = /\u0020/;
var pattern3 = /\u{20}/u;
var pattern4 = /\t/;
var pattern5 = /\n/;
var pattern6 = new RegExp("\x20");
var pattern7 = new RegExp("\\t");
var pattern8 = new RegExp("\\n");
```

## How to use

```json
{
  "rules": {
    "eslint/no-control-regex": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-control-regex": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-control-regex)
