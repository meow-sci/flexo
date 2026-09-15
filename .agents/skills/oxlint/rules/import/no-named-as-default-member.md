---
title: "import/no-named-as-default-member"
rule: "import/no-named-as-default-member"
category: "Suspicious"
version: "0.2.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-as-default-member.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Reports the use of an exported name (named export) as a property on the
default export. This occurs when trying to access a named export through
the default export, which is incorrect.

### Why is this bad?

Accessing a named export via the default export is incorrect and will not
work as expected. Named exports should be imported directly, while default
exports are accessed without properties. This mistake can lead to runtime
errors or undefined behavior.

### Examples

Given

```javascript
// ./bar.js
export function bar() {
  return null;
}
export default () => {
  return 1;
};
```

Examples of **incorrect** code for this rule:

```javascript
// ./foo.js
import foo from "./bar";
const bar = foo.bar; // Incorrect: trying to access named export via default
```

Examples of **correct** code for this rule:

```javascript
// ./foo.js
import { bar } from "./bar"; // Correct: accessing named export directly
```

## How to use

```json
{
  "rules": {
    "import/no-named-as-default-member": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-named-as-default-member": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.1.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-as-default-member.md)
