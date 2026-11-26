#!/usr/bin/env node
// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Agent Stop hook: lint the source files git shows as changed and hand failures back to
// the agent. Usage: node lint.mjs <claude|codex|cursor>, with the hook's JSON on stdin.
// Silent when clean, when there is no git repository, or on a second attempt in a row.
// Findings recorded in oxlint-suppressions.json don't count; fixed ones and deleted files are
// pruned from it.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  checkScan,
  createScratch,
  inProject,
  parseReport,
  publishBaseline,
  readBaseline,
} from './baseline.mjs';

const agent = process.argv[2];
let input = {};

try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // No or malformed hook input: lint anyway, as on a first attempt.
}

const source = /\.(?:[cm]?[jt]sx?)$/;

// Report without blocking again when the agent already had one try, so it can't loop.
const retry = agent === 'cursor' ? input.loop_count > 0 : input.stop_hook_active === true;

// Skip aborted or errored turns; a missing status (bad input) still lints.
if (agent === 'cursor' && input.status !== undefined && input.status !== 'completed') {
  process.exit(0);
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').stdout.trim();

if (!root) {
  process.exit(0);
}

// "XY path\0", with a rename or copy followed by its old path, which is skipped.
const entries = git(
  '-C',
  root,
  'status',
  '--porcelain',
  '-z',
  '--untracked-files=all',
).stdout.split('\0');

const files = [];

for (let index = 0; index < entries.length; index++) {
  const entry = entries[index];

  if (/[RC]/.test(entry.slice(0, 2))) {
    index++;
  }

  const file = entry.slice(3);

  if (source.test(file) && !file.endsWith('.d.ts') && existsSync(`${root}/${file}`)) {
    files.push(file);
  }
}

/** Shrink each recorded count to what `found` allows, and write the baseline if that changed it. */
function prune(scratch, found) {
  const kept = {};
  const recorded = readBaseline(root) ?? {};

  for (const [file, rules] of Object.entries(recorded)) {
    for (const [rule, { count }] of Object.entries(rules)) {
      const left = Math.min(count, found(file, rule));

      if (left > 0) {
        kept[file] ??= {};
        kept[file][rule] = { count: left };
      }
    }
  }

  if (!isDeepStrictEqual(kept, recorded)) {
    publishBaseline(root, scratch, kept);
  }
}

const isDeleted = (file) => !existsSync(`${root}/${file}`);

// Drop baseline entries for deleted files, so a new file at the same path starts clean.
function pruneDeleted() {
  try {
    if (Object.keys(readBaseline(root) ?? {}).some((file) => isDeleted(file))) {
      prune(createScratch(root), (file) => (isDeleted(file) ? 0 : Infinity));
    }
  } catch {
    // Read-only: Oxlint ignores entries for files that no longer exist.
  }
}

if (files.length === 0) {
  pruneDeleted();
  process.exit(0);
}

const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

const run = (args, cwd) =>
  spawnSync(process.execPath, args, { cwd, encoding: 'utf8', maxBuffer: Infinity });

const lint = () => run([oxlint, ...files], root);
let result = lint();
let unpruned = '';

// The agent fixed findings recorded in the baseline: shrink it to match.
if (/suppressions that do not occur anymore/.test(result.stdout + result.stderr)) {
  try {
    const scratch = createScratch(root);
    checkScan(oxlint, scratch);
    const paths = files.map((file) => `${root}/${file}`);
    const reported = run([...inProject, oxlint, '--format=json', ...paths], scratch);
    const { entries, unrecordable } = parseReport({ ...reported, scratch }, root);

    // A file with a syntax error reports nothing else, though its findings are still there.
    const scanned = unrecordable.length === 0;

    prune(scratch, (file, rule) => {
      if (isDeleted(file)) {
        return 0;
      }

      return scanned && files.includes(file) ? (entries[file]?.[rule]?.count ?? 0) : Infinity;
    });

    if (scanned) {
      result = lint();
    } else {
      unpruned = `\nCouldn't prune suppressions for existing files. Fix these first; a baseline can't record them:\n${unrecordable.join('\n')}`;
    }
  } catch (error) {
    // Read-only, or Oxlint failed: report what it said, and why the baseline stays as it is.
    unpruned = `\noxlint-suppressions.json wasn't pruned: ${error.message}`;
  }
} else {
  pruneDeleted();
}

if (result.status === 0) {
  process.exit(0);
}

const report = `Oxlint found problems in files changed in this session:\n\n${result.stdout}${result.stderr}${unpruned}
Fix the code rather than disabling rules or running \`oxlint --suppress-all\`.
Fix the design behind structural errors; don't move code around to silence them.
\`npx oxlint --fix <file>\` applies the autofixes.`;

// Cursor's followup_message re-prompts the agent, so on a retry it would block again.
if (retry) {
  console.error(`${report}\n(Already asked once; not blocking again.)`);
} else if (agent === 'cursor') {
  console.log(JSON.stringify({ followup_message: report }));
} else {
  console.error(report);
  process.exit(2);
}
