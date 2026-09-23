# packages/shared

Shared TypeScript types and zod schemas used by `apps/mobile` and (indirectly)
`services/ai` call contracts. Imported as `@eldercare/shared`.

Two rules encoded here on purpose:

- **Enums are the single source of truth** for statuses, taken from
  `docs/00-product-flow.md`. UI code should not invent its own strings.
- **Every status has a text label.** The product forbids conveying status by
  color alone, so each status enum ships a `*Labels` map. A test fails if a
  status is missing a label.

This package ships TypeScript source (`main` points at `src/index.ts`) and is
transpiled by the consumer, so there is no build step to keep in sync.
