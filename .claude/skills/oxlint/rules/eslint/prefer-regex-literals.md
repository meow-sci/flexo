---
title: "eslint/prefer-regex-literals"
rule: "eslint/prefer-regex-literals"
category: "Style"
version: "1.64.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/prefer-regex-literals"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow use of the RegExp constructor in favor of regular expression literals.

### Why is this bad?

There are two ways to create a regular expression:

- Regular expression literals, e.g., `/abc/u`.
- The `RegExp` constructor function, e.g., `new RegExp("abc", "u")` or `RegExp("abc", "u")`.

The constructor function is particularly useful when you want to dynamically generate the pattern,
because it takes string arguments.

When using the constructor function with string literals, don't forget that the string escaping rules still apply.
If you want to put a backslash in the pattern, you need to escape it in the string literal.
Thus, the following are equivalent:

```js
new RegExp("^\\d\\.$");

/^\d\.$/;

// matches "0.", "1.", "2." ... "9."
```

In the above example, the regular expression literal is easier to read and reason about.
Also, it's a common mistake to omit the extra `\` in the string literal, which would produce a completely different regular expression:

```js
new RegExp("^\d\.$");

// equivalent to /^d.$/, matches "d1", "d2", "da", "db" ...
```

When a regular expression is known in advance, it is considered a best practice to avoid the string literal notation on top
of the regular expression notation, and use regular expression literals instead of the constructor function.

### Examples

Examples of **incorrect** code for this rule:

```js
new RegExp("abc");
new RegExp("abc", "u");
RegExp("abc");
RegExp("abc", "u");
new RegExp("\\d\\d\\.\\d\\d\\.\\d\\d\\d\\d");
RegExp(`^\\d\\.$`);
new RegExp(String.raw`^\d\.$`);
```

Examples of **correct** code for this rule:

```js
/abc/;
/abc/u;
/\d\d\.\d\d\.\d\d\d\d/;
/^\d\.$/;
// RegExp constructor is allowed for dynamically generated regular expressions
new RegExp(pattern);
RegExp("abc", flags);
new RegExp(prefix + "abc");
RegExp(`${prefix}abc`);
new RegExp(String.raw`^\d\. ${suffix}`);
```

## Configuration

### disallowRedundantWrapping

type: `boolean`

default: `false`

By default, this rule doesn’t check when a regex literal is unnecessarily wrapped in a `RegExp` constructor call.
When the option `disallowRedundantWrapping` is set to `true`, the rule will also disallow such unnecessary patterns.

Examples of **incorrect** code for `{ "disallowRedundantWrapping": true }`:

```js
new RegExp(/abc/);
new RegExp(/abc/, "u");
```

Examples of **correct** code for `{ "disallowRedundantWrapping": true }`:

```js
/abc/;
/abc/u;
new RegExp(/abc/, flags);
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-regex-literals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-regex-literals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.64.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-regex-literals)
