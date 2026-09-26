---
title: "import/no-relative-parent-imports"
rule: "import/no-relative-parent-imports"
category: "Restriction"
version: "1.43.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-relative-parent-imports.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Forbids importing modules from parent directories using relative paths.

### Why is this bad?

This restriction enforces tree-like folder structures instead of complex
graph-like structures, making large codebases easier to maintain.
Dependencies flow in one direction (parent to child), which clarifies
module relationships.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import foo from "../bar";
import foo from "../../utils/helper";
const baz = require("../config");
export { qux } from "../shared";
```

Examples of **correct** code for this rule:

```javascript
import foo from "lodash";
import a from "./lib/a";
import b from "./b";
```

## How to use

```json
{
  "rules": {
    "import/no-relative-parent-imports": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-relative-parent-imports": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.43.0.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-relative-parent-imports.md)
