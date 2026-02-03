# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-28T13:42:42Z
**Commit:** c27d064
**Branch:** main

## OVERVIEW

Elysia + Bun web template. Minimal starter project.

## STRUCTURE

```
./
├── src/
│   └── index.ts    # Elysia app entry (12 lines)
└── package.json
```

## WHERE TO LOOK

| Task         | Location      | Notes               |
| ------------ | ------------- | ------------------- |
| Main entry   | src/index.ts  | Single file app     |
| Dev server   | `bun run dev` | Starts on port 3000 |
| Dependencies | package.json  | elysia              |

## CONVENTIONS

- Bun runtime (`bun run` commands)
- ES2021 target, ES2022 modules
- Strict TypeScript enabled
- **Mandatory unit tests**: Every function MUST have unit tests with at least 80% coverage
- **Lint on every change**: After ANY code change, run lint checks (`bun run lint` or equivalent) and fix all errors until the linter passes.
- **Format after lint**: After lint passes, run the formatter (`bun run format` or equivalent) to maintain consistent code style.

## AGENT USAGE

- **ElysiaJS**: Web framework. Docs index: https://elysiajs.com/llms.txt

## COMMANDS

```bash
bun run dev    # Start dev server (port 3000)
```

## NOTES

- Minimal template - expand from src/index.ts
