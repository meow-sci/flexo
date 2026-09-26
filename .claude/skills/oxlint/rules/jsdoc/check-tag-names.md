---
title: "jsdoc/check-tag-names"
rule: "jsdoc/check-tag-names"
category: "Correctness"
version: "0.3.2"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/checkTagNames.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Reports invalid block tag names.
Additionally checks for tag names that are redundant when using a type checker such as TypeScript.

### Why is this bad?

Using invalid tags can lead to confusion and make the documentation harder to read.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** @Param */
/** @foo */

/**
 * This is redundant when typed.
 * @type {string}
 */
```

Examples of **correct** code for this rule:

```javascript
/** @param */
```

### Settings

Configuration for allowed tags is done via [`settings.jsdoc.tagNamePreference`](../../config-file-reference.md#settings-jsdoc-tagnamepreference).
There is no CLI-only parameter for this rule.

You can add custom tags by adding a key-value pair where both match the name of the tag you want to add, like so:


```json
{
  "plugins": ["jsdoc"],
  "rules": {
    "jsdoc/check-tag-names": "error"
  },
  "settings": {
    // [!code highlight:7]
    "jsdoc": {
      "tagNamePreference": {
        "customTagName": "customTagName"
      }
    }
  }
}
```


Examples of correct code for this rule with the above configuration, adding the `customTagName` tag:

```js
/**
 * @customTagName
 */
```

## Configuration

This rule accepts a configuration object with the following properties:

### definedTags

type: `string[]`

default: `[]`

Additional tag names to allow.

### jsxTags

type: `boolean`

default: `false`

Whether to allow JSX-related tags:

- `jsx`
- `jsxFrag`
- `jsxImportSource`
- `jsxRuntime`

### typed

type: `boolean`

default: `false`

If typed is `true`, disallow tags that are unnecessary/duplicative of TypeScript functionality.

## How to use

```json
{
  "rules": {
    "jsdoc/check-tag-names": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/check-tag-names": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.2.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/checkTagNames.md)
