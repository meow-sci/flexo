---
name: oxcfmt
description: skill for using oxcfmt library for code formatting for various languages
---


# Oxfmt

<AppBadgeList />

Oxfmt (`/oʊ-ɛks-fɔːr-mæt/`) is a high-performance formatter for the JavaScript ecosystem.

## Supported languages

Support includes JavaScript, JSX, TypeScript, TSX, JSON, JSONC, JSON5, YAML, TOML, HTML, Angular, Vue, Svelte, CSS, SCSS, Less, Markdown, MDX, GraphQL, Ember, Handlebars, and more.

See the [config file reference](config-file-reference.md) for supported file types and configuration options.

## Built for scale

Oxfmt targets large codebases and CI environments, with an emphasis on high throughput and predictable performance.

It is built on the Oxc compiler stack and avoids architectural bottlenecks common in existing formatter implementations.

Our [benchmarks](https://github.com/oxc-project/bench-formatter) show Oxfmt to be approximately 30x faster than Prettier and 2x faster than Biome.

## Batteries included

Oxfmt includes built-in features that typically require external Prettier plugins:

- [Import sorting](sorting.md#sort-imports)
- [Tailwind CSS class sorting](sorting.md#tailwind-css-class-sorting)
- [package.json field sorting](sorting.md#sort-package-json-fields)
- [Embedded formatting](embedded-formatting.md) (CSS-in-JS, GraphQL, etc.)

## Prettier-compatible

Oxfmt integrates into existing Prettier-based workflows.

The Oxfmt CLI follows Prettier's conventions closely enough that most scripts and tooling require little or no modification, though some defaults and CLI options differ.

Oxfmt matches Prettier’s JavaScript formatting. When migrating from recent versions of Prettier, formatting differences should not occur; any formatting differences are considered bugs.

Oxfmt now passes 100% of Prettier's JavaScript and TypeScript conformance tests. For any remaining formatting inconsistencies, we have [reported them to the Prettier team](https://github.com/oxc-project/oxc/issues/18717) and are collaborating to converge on expected behavior.

No additional dependencies or configuration needed.

## Getting started

Install `oxfmt` as a dev dependency:

```sh
pnpm add -D oxfmt
```

Add scripts to `package.json`:

```json [package.json]
{
  "scripts": {
    "fmt": "oxfmt",
    "fmt:check": "oxfmt --check"
  }
}
```

Format files:

```sh
pnpm run fmt
```

Check formatting without writing files:

```sh
pnpm run fmt:check
```

## Next steps:

- [Quickstart](quickstart.md)
- [Configuration](config.md)
- [Setup editors](editors.md)
- [Setup CI](ci.md)

## References

- [CLI reference](cli.md)
- [Config file reference](config-file-reference.md)
- [Unsupported features](unsupported-features.md)