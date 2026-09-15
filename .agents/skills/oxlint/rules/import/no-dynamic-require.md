---
title: "import/no-dynamic-require"
rule: "import/no-dynamic-require"
category: "Restriction"
version: "0.9.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-dynamic-require.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Forbids imports that use an expression for the module argument. This includes
dynamically resolved paths in `require` or `import` statements.

### Why is this bad?

Using expressions that are resolved at runtime in import statements makes it
difficult to determine where the module is being imported from. This can complicate
code navigation and hinder static analysis tools, which rely on predictable module paths
for linting, bundling, and other optimizations.

### Examples

Examples of **incorrect** code for this rule:

```javascript
require(name);
require(`../${name}`);
```

Examples of **correct** code for this rule:

```javascript
require("../name");
require(`../name`);
```

## Configuration

This rule accepts a configuration object with the following properties:

### esmodule

type: `boolean`

default: `false`

When `true`, also check `import()` expressions for dynamic module specifiers.

## How to use

```json
{
  "rules": {
    "import/no-dynamic-require": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-dynamic-require": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.3.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-dynamic-require.md)
