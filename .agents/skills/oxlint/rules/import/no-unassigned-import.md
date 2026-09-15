---
title: "import/no-unassigned-import"
rule: "import/no-unassigned-import"
category: "Suspicious"
version: "0.16.11"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-unassigned-import.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule aims to remove modules with side-effects by reporting when a module is imported but not assigned.

### Why is this bad?

With both CommonJS' require and the ES modules' import syntax,
it is possible to import a module but not to use its result.
This can be done explicitly by not assigning the module to a variable.
Doing so can mean either of the following things:

- The module is imported but not used
- The module has side-effects. Having side-effects,
  makes it hard to know whether the module is actually used or can be removed.
  It can also make it harder to test or mock parts of your application.

### Examples

Examples of **incorrect** code for this rule:

```js
import "should";
require("should");
```

Examples of **correct** code for this rule:

```js
import _ from "foo";
import _, { foo } from "foo";
import _, { foo as bar } from "foo";
const _ = require("foo");
const { foo } = require("foo");
const { foo: bar } = require("foo");
bar(require("foo"));
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `string[]`

default: `[]`

A list of glob patterns to allow unassigned imports for specific modules.
For example:
`{ "allow": ["**/*.css"] }` will allow unassigned imports for any module ending with `.css`.

## How to use

```json
{
  "rules": {
    "import/no-unassigned-import": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-unassigned-import": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.11.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-unassigned-import.md)
