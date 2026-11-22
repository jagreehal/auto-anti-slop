# `anti-slop/no-module-mocking`

`vi.mock` and `jest.mock` replace a module for the whole test file. The test then passes against wiring that production never uses. Give the code a seam instead: pass the dependency in, and pass a fake in the test.

## ❌ Bad

```ts
import { vi } from 'vitest';

vi.mock('./clock');
```

## ✅ Good

```ts
interface Clock {
  now: () => number;
}

export function isExpired(expiresAt: number, clock: Clock): boolean {
  return clock.now() > expiresAt;
}

// In the test: isExpired(10, { now: () => 11 })
```

The rule covers `mock`, `doMock` and `unstable_mockModule` on `vi` (from `vitest`) and `jest` (global or from `@jest/globals`).

[Back to the rule list](../../README.md#added-rules)
