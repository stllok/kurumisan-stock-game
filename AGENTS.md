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
- **Effect.Effect over Promise**: All library functions MUST use `Effect.Effect<SuccessType, ErrorType>` type instead of `Promise<SuccessType>`. This enables Effect's composability and error handling capabilities.
- **ErrorType definition**: When using `Effect.Effect`, always define the `ErrorType` parameter. Use specific error types (e.g., `HttpError`, `ValidationError`) rather than generic `unknown` or `Error`.
- **Effect.succeed and Effect.fail**: Use `Effect.succeed(value)` for successful operations and `Effect.fail(error)` for error cases. Avoid mixing Promise-like patterns with Effect.
- **Pipe control flow**: Use `pipe` from Effect for complex control flows (e.g., `pipe(input, transform, validate, handleErrors)`). This improves readability and composability.
- **Lint on every change**: After ANY code change, run lint checks (`bun run lint` or equivalent) and fix all errors until the linter passes.
- **Format after lint**: After lint passes, run the formatter (`bun run format` or equivalent) to maintain consistent code style.
- **Effect Schema for data validation**: Use Effect Schema (Schema.Schema) for defining data structures. Schema provides built-in `encode` and `decode` methods for JSON (and other formats).
- **Custom encode/decode**: For custom classes/structs, write custom encode/decode functions or use `Schema.custom` to define serialization behavior.

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
