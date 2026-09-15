---
title: "import/no-webpack-loader-syntax"
rule: "import/no-webpack-loader-syntax"
category: "Restriction"
version: "0.7.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-webpack-loader-syntax.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Forbids using Webpack loader syntax directly in import or require statements.

### Why is this bad?

This loader syntax is non-standard, so it couples the code to Webpack. The recommended way to
specify Webpack loader configuration is in a [Webpack configuration file](https://webpack.js.org/concepts/loaders/#configuration).

### Examples

Examples of **incorrect** code for this rule:

```javascript
import myModule from "my-loader!my-module";
import theme from "style!css!./theme.css";

var myModule = require("my-loader!./my-module");
var theme = require("style!css!./theme.css");
```

Examples of **correct** code for this rule:

```javascript
import myModule from "./my-module";
import theme from "./theme.css";

var myModule = require("./my-module");
var theme = require("./theme.css");
```

## How to use

```json
{
  "rules": {
    "import/no-webpack-loader-syntax": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-webpack-loader-syntax": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.0.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-webpack-loader-syntax.md)
