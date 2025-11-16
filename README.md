# editorconfig

A small CLI to manage a **consistent `.editorconfig`** across your projects.

- ✅ Generate a sane default `.editorconfig` in seconds
- ✅ Check if your existing file matches the target setup
- 🔜 Propose updates (with confirmation) instead of blindly overwriting
- 🔜 Compare your file against the recommended template

## Why?

Keeping `.editorconfig` aligned across multiple repositories is boring and error-prone:

- Some repos have no `.editorconfig`
- Some have outdated or partial settings
- People copy–paste from “somewhere” and drift over time

This CLI aims to provide a **single source of truth** for your preferred `.editorconfig`, and a few helpers to keep it in sync.

## Installation

You can use it **without installing**, via `npx`:

```bash
npx @sheplu/editorconfig --mode=write
```

Or install it globally:

```bash
npm install -g @sheplu/editorconfig
editorconfig
```

Or as a dev dependency:

```bash
npm install -D @sheplu/editorconfig
```

## Quick Start

From the root of your project:

```bash
npx @sheplu/editorconfig --mode=write
```

This will:

- Create a `.editorconfig` file if it doesn’t exist
- (Current behavior) Write the default template
- (Future behavior) Ask before overwriting an existing file

## Current Features

### `write`

```bash
npx @sheplu/editorconfig --mode=write
```

Creates a base `.editorconfig` file in the current directory.

Typical content (example):

```ini
root = true

[*]
indent_style = tab
indent_size = 4
tab_width = 4
end_of_line = lf
charset = utf-8
spelling_language = en
trim_trailing_whitespace = true
insert_final_newline = true
quote_type = single
spaces_around_operators = true
```

### `check`

```bash
npx @sheplu/editorconfig --mode=check
```

Validates your existing `.editorconfig` and reports any drift from the target configuration.

This command will:

- Read your existing .editorconfig
- Compare it against the tool’s canonical template
- Exit with:
  - `0` if everything matches
  - `1` if differences are found

## Planned / Upcoming Features

### 1. Interactive update / replace

```bash
npx @sheplu/editorconfig --mode=fix
```

### 2. Compare with target setup

```bash
npx @sheplu/editorconfig --mode=diff
```

## Roadmap

- [ ] Add diff logic and `diff` command
- [ ] Add interactive `fix` / `update` command
- [ ] Expose presets or configuration options
- [ ] Add tests and CI examples

Additional properties can be found on the [editorconfig wiki](https://github.com/editorconfig/editorconfig/wiki/editorconfig-properties).
