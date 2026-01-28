# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-28T13:42:42Z
**Commit:** c27d064
**Branch:** main

## OVERVIEW

Elysia + Bun web template with Effect functional programming. Minimal starter project.

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
| Dependencies | package.json  | elysia, @effect/\*  |

## CONVENTIONS

- Bun runtime (`bun run` commands)
- ES2021 target, ES2022 modules
- Strict TypeScript enabled
- **Mandatory unit tests**: Every function MUST have unit tests with at least 80% coverage

## AGENT USAGE

- **Effect**: MUST use for functional programming patterns. Full docs: https://effect.website/llms-small.txt (index: https://effect.website/llms.txt)
- **ElysiaJS**: Web framework. Docs index: https://elysiajs.com/llms.txt

## COMMANDS

```bash
bun run dev    # Start dev server (port 3000)
```

## NOTES

- Effect v3.19.x functional programming library included
- Minimal template - expand from src/index.ts
