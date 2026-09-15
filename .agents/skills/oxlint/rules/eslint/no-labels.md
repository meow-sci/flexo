---
title: "eslint/no-labels"
rule: "eslint/no-labels"
category: "Style"
version: "0.15.4"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-labels"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow labeled statements.

### Why is this bad?

Labeled statements in JavaScript are used in conjunction with `break` and `continue` to control flow around multiple loops. For example:

```js
outer: while (true) {
  while (true) {
    break outer;
  }
}
```

The `break outer` statement ensures that this code will not result in an infinite loop because control is returned to the next statement after the `outer` label was applied. If this statement was changed to be just `break`, control would flow back to the outer `while` statement and an infinite loop would result.
While convenient in some cases, labels tend to be used only rarely and are frowned upon by some as a remedial form of flow control that is more error prone and harder to understand.

### Examples

Examples of **incorrect** code for this rule:

```js
label: while (true) {
  // ...
}

label: while (true) {
  break label;
}

label: while (true) {
  continue label;
}

label: switch (a) {
  case 0:
    break label;
}

label: {
  break label;
}

label: if (a) {
  break label;
}
```

Examples of **correct** code for this rule:

```js
var f = {
  label: "foo",
};

while (true) {
  break;
}

while (true) {
  continue;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowLoop

type: `boolean`

default: `false`

If set to `true`, this rule ignores labels which are sticking to loop statements.
Examples of **correct** code with this option set to `true`:

```js
label: while (true) {
  break label;
}
```

### allowSwitch

type: `boolean`

default: `false`

If set to `true`, this rule ignores labels which are sticking to switch statements.
Examples of **correct** code with this option set to `true`:

```js
label: switch (a) {
  case 0:
    break label;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-labels": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-labels": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-labels)
