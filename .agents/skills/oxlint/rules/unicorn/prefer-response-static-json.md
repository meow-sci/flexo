---
title: "unicorn/prefer-response-static-json"
rule: "unicorn/prefer-response-static-json"
category: "Style"
version: "1.29.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-response-static-json.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Enforces the use of `Response.json()` over `new Response(JSON.stringify())`.

### Why is this bad?

`Response.json()` is a more concise and semantically clear way to create JSON responses.
It automatically sets the correct `Content-Type` header (`application/json`) and handles
serialization, making the code more maintainable and less error-prone.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const response = new Response(JSON.stringify(data));
const response = new Response(JSON.stringify(data), { status: 200 });
```

Examples of **correct** code for this rule:

```javascript
const response = Response.json(data);
const response = Response.json(data, { status: 200 });
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-response-static-json": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-response-static-json": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.29.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-response-static-json.md)
