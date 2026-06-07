---
title: "eslint/no-unused-labels"
rule: "eslint/no-unused-labels"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-unused-labels"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow unused labels.

### Why is this bad?

Labels that are declared and not used anywhere in the code are most likely an error due to incomplete refactoring.

### Examples

Examples of **incorrect** code for this rule:

```javascript
OUTER_LOOP: for (const student of students) {
  if (checkScores(student.scores)) {
    continue;
  }
  doSomething(student);
}
```

Examples of **correct** code for this rule:

```javascript
for (const student of students) {
  if (checkScores(student.scores)) {
    continue;
  }
  doSomething(student);
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-unused-labels": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unused-labels": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unused-labels)
