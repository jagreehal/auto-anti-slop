// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

test('a consumer can load the preset with its lint rules and file overrides', async ({
  onTestFinished,
}) => {
  const project = await mkdtemp(join(root, '.consumer-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));
  await mkdir(join(project, 'server', 'src'), { recursive: true });

  const detachedMethod = `
    class Counter {
      value = 0;

      read() {
        return this.value;
      }
    }

    export const read = new Counter().read;
  `;

  const fixtures = {
    'anti-slop.ts': `
      export interface UserShape {
        id: string;
      }
      export const isText = (input: string | number): boolean => typeof input === 'string';
    `,
    'assertion.ts': `
      export function read(value: unknown): string {
        return (value as { text: string }).text;
      }
    `,
    'complex.ts': `
      export function score(a: number, b: number, c: number, d: number): number {
        if (a > 0) {
          if (b > 0) {
            if (c > 0) {
              if (d > 0) {
                return a > b && b > c && c > d ? 1 : 2;
              }
            }
          }
        }

        if (a < 0 || b < 0 || c < 0) {
          return 3;
        }

        return 0;
      }
    `,
    'conditions.ts': `
      export function label(count: number | undefined, kind: 'a'): string {
        if (count) {
          return 'some';
        }

        return kind === 'a' ? 'a' : 'other';
      }
    `,
    // Tests construct objects to check the constructor throws; elsewhere it's a discarded object.
    'construct.js': 'new URL("https://example.com");',
    'construct.test.js': 'new URL("https://example.com");',
    'eval.js': 'eval("1 + 2");',
    'globals.js': 'export const location = window.location.href + process.cwd();',
    'method.test.int.ts': detachedMethod,
    'method.test.ts': detachedMethod,
    'method.ts': detachedMethod,
    'mock.test.js': "import { vi } from 'vitest';\n\nvi.mock('./self');",
    'nullish.ts': `
      export const loose = (value: number | null | undefined): boolean => value == null;

      export const strict = (value: number | null | undefined): boolean =>
        value === null || value === undefined;
    `,
    'oxlint.config.ts': `
      import autoAntiSlop from 'auto-anti-slop';
      import { defineConfig } from 'oxlint';

      export default defineConfig({ ...autoAntiSlop });
    `,
    'promises.ts': `
      declare function load(): Promise<string>;
      declare function onClick(handler: () => void): void;

      onClick(async () => {
        await load();
      });

      export async function plainReturn(): Promise<string> {
        return await load();
      }

      export async function catchRejection(): Promise<string> {
        try {
          return load();
        } catch (error: unknown) {
          return String(error);
        }
      }

      export function rejectionHandlers(): Array<Promise<string>> {
        return [
          load().catch((error: unknown) => \`caught \${String(error)}\`),
          load().then(
            (text) => text,
            (error: unknown) => \`rejected \${String(error)}\`,
          ),
        ];
      }

      export function forgotAwait(): void {
        load();
      }
    `,
    'self.ts': `
      import { value as importedValue } from './self';

      export const value = 42;

      export function read(): number {
        return importedValue;
      }
    `,
    'server/src/app.tsx': 'console.log("debug");',
    'throw.js': 'export function fail() { throw "failure"; }',
    'throw.test.ts': 'export function fail(): never { throw "fixture"; }',
    'throw.ts': 'export function fail(): never { throw "failure"; }',
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noEmit: true, strict: true, types: [] },
      include: ['*.ts', 'server/src/*.tsx'],
    }),
  };

  await Promise.all(
    Object.entries(fixtures).map(([name, source]) => writeFile(join(project, name), source)),
  );

  const sourceFiles = Object.keys(fixtures).filter(
    (name) => name !== 'oxlint.config.ts' && name !== 'tsconfig.json',
  );

  // Test standalone Oxlint config discovery outside Vite+ mode.
  const result = spawnSync(
    process.execPath,
    [oxlint, '--format=json', '--no-ignore', ...sourceFiles],
    { cwd: project, encoding: 'utf8', env: { ...process.env, VP_VERSION: undefined } },
  );

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(1);
  expect(result.stdout, result.stderr || result.stdout).toMatch(/^\s*\{/);

  const { diagnostics } = JSON.parse(result.stdout);

  const findings = diagnostics.map(({ code, filename, severity }) =>
    [filename, code, severity].join(' '),
  );

  expect(findings.toSorted()).toEqual([
    'anti-slop.ts anti-slop(no-runtime-typeof) error',
    'anti-slop.ts anti-slop(no-shape-in-symbol-names) error',
    'anti-slop.ts anti-slop(require-readable-spacing) error',
    'assertion.ts anti-slop(no-unknown-parameters) error',
    'assertion.ts anti-slop(require-safety-comment-for-type-assertion) error',
    'assertion.ts typescript(no-unsafe-type-assertion) error',
    'complex.ts eslint(complexity) error',
    'complex.ts eslint(max-params) error',
    'complex.ts sonarjs(cognitive-complexity) error',
    'conditions.ts typescript(no-unnecessary-condition) error',
    'conditions.ts typescript(strict-boolean-expressions) error',
    'construct.js eslint(no-new) error',
    'eval.js eslint(no-eval) error',
    'method.ts typescript(unbound-method) error',
    'mock.test.js anti-slop(no-module-mocking) error',
    'nullish.ts eslint(eqeqeq) error',
    'promises.ts typescript(no-floating-promises) error',
    'promises.ts typescript(no-misused-promises) error',
    'promises.ts typescript(return-await) error',
    'self.ts import(no-cycle) error',
    'self.ts import(no-self-import) error',
    'server/src/app.tsx eslint(no-console) error',
    'throw.js eslint(no-throw-literal) error',
    'throw.ts typescript(only-throw-error) error',
  ]);
});
