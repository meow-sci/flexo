---
title: "eslint/no-useless-escape"
rule: "eslint/no-useless-escape"
category: "Correctness"
version: "0.0.5"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-useless-escape"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow unnecessary escape characters.

### Why is this bad?

Escaping characters unnecessarily has no effect on the behavior of strings or regexes,
and can make code harder to read and understand by adding unnecessary complexity.
This applies to string literals, template literals, and regular expressions.

### Examples

Examples of **incorrect** code for this rule:

```javascript
"\'";
'\"';
"\#";
"\e";
`\"`;
`\"${foo}\"`;
`\#{foo}`;
/\!/;
/\@/;
/[\[]/;
/[a-z\-]/;
```

Examples of **correct** code for this rule:

```javascript
"\"";
'\'';
"\x12";
"\u00a9";
"\371";
"xs\u2111";
`\``;
`\${${foo}}`;
`$\{${foo}}`;
/\\/g;
/\t/g;
/\w\$\*\^\./;
/[[]/;
/[\]]/;
/[a-z-]/;
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowRegexCharacters

type: `string[]`

default: `[]`

An array of characters that are allowed to be escaped unnecessarily in regexes.
For example, setting this to `["#"]` allows `\#` in regexes.

Each string in this array must be a single character.

## How to use

```json
{
  "rules": {
    "eslint/no-useless-escape": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-escape": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-escape)
