import autoAntiSlop from 'auto-anti-slop';
import { defineConfig } from 'oxlint';

// Not named oxlint.config.ts: Oxlint would find that inside a linked copy of this package.
// Type-check too, so an example can't quietly stop compiling.
export default defineConfig({
  ...autoAntiSlop,
  options: { ...autoAntiSlop.options, typeCheck: true },
});
