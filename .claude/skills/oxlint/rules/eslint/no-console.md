---
title: "eslint/no-console"
rule: "eslint/no-console"
category: "Restriction"
version: "0.0.13"
default: false
type_aware: false
fix: "conditional_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-console"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 💡 conditional suggestion |
| Type-aware | no |


### What it does

Disallow the use of console.

### Why is this bad?

In JavaScript that is designed to be executed in the browser, it’s considered a best
practice to avoid using methods on console. Such messages are considered to be for
debugging purposes and therefore not suitable to ship to the client. In general, calls
using console should be stripped before being pushed to production.

### Examples

Examples of **incorrect** code for this rule:

```javascript
console.log("Log a debug level message.");
console.warn("Log a warn level message.");
console.error("Log an error level message.");
console.log = foo();
```

Examples of **correct** code for this rule:

```javascript
// custom console
Console.log("Hello world!");
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `string[]`

default: `[]`

The `allow` option permits the given list of console methods to be used as exceptions to
this rule.

Say the option was configured as `{ "allow": ["info"] }` then the rule would behave as
follows:

Example of **incorrect** code for this option:

```javascript
console.log("foo");
```

Example of **correct** code for this option:

```javascript
console.info("foo");
```

## How to use

```json
{
  "rules": {
    "eslint/no-console": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-console": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-console)
