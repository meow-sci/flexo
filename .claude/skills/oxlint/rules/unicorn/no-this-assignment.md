---
title: "unicorn/no-this-assignment"
rule: "unicorn/no-this-assignment"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-this-assignment.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow assigning `this` to a variable.

### Why is this bad?

Assigning `this` to a variable is unnecessary and confusing.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = this;
class Bar {
  method() {
    foo.baz();
  }
}

new Bar().method();
```

Examples of **correct** code for this rule:

```javascript
class Bar {
  constructor(fooInstance) {
    this.fooInstance = fooInstance;
  }
  method() {
    this.fooInstance.baz();
  }
}

new Bar(this).method();
```

## How to use

```json
{
  "rules": {
    "unicorn/no-this-assignment": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-this-assignment": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-this-assignment.md)
