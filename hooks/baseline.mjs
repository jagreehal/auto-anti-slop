// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Oxlint reports, and we write the baseline from its report. One step publishes the finished file,
// so an interrupted run keeps the previous baseline.

import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export const baseline = 'oxlint-suppressions.json';

/** Node arguments to run Oxlint in a scratch directory, with configs evaluated in the project. */
export const inProject = ['--import', import.meta.resolve('./project-cwd.mjs')];

/**
 * A directory in the project to run Oxlint from: there it uses the project's config but not its
 * baseline, as long as paths are absolute and `inProject` is set. Removed when the process ends.
 */
export function createScratch(root) {
  const scratch = mkdtempSync(join(root, '.oxlint-baseline-'));

  process.on('exit', () => rmSync(scratch, { force: true, recursive: true }));
  // Git, and so Oxlint, ignores the directory even if a killed process leaves it behind.
  writeFileSync(join(scratch, '.gitignore'), '*\n');

  return scratch;
}

/** The baseline's name for the rule behind an error, or undefined if it can't record the error. */
function ruleOf({ code = '' }) {
  const [, plugin, rule] = /^([^(]+)\((.+)\)$/.exec(code) ?? [];

  // Syntax errors and unused directives have no rule; the compiler's errors aren't from one.
  if (rule === undefined || /^TS\d+$|^tsconfig-error$/.test(rule)) {
    return undefined;
  }

  return plugin === 'eslint' ? rule : `${plugin}/${rule}`;
}

/** The baseline that records a `--format=json` report, and the errors no baseline can record. */
export function parseReport({ scratch, status, stdout }, root) {
  const { diagnostics } = JSON.parse(stdout);
  const errors = diagnostics.filter(({ severity }) => severity === 'error');
  const entries = {};
  const unrecordable = [];

  if (status !== 0 && errors.length === 0) {
    throw new Error('Oxlint failed without reporting an error.');
  }

  for (const error of errors) {
    const rule = ruleOf(error);
    const file = relative(root, resolve(scratch, error.filename)).split(sep).join('/');

    if (rule === undefined) {
      unrecordable.push(`${file}: ${error.message}`);
    } else {
      entries[file] ??= {};
      entries[file][rule] ??= { count: 0 };
      entries[file][rule].count++;
    }
  }

  return { entries, unrecordable };
}

const isObject = (value) => value?.constructor === Object;

// Only the shape Oxlint writes, { path: { rule: { count } } }, so a hand-edited or corrupt file is
// left for Oxlint to report rather than rewritten.
const isBaseline = (value) =>
  isObject(value) &&
  Object.values(value).every(
    (rules) =>
      isObject(rules) &&
      Object.values(rules).every(
        (entry) => isObject(entry) && Number.isInteger(entry.count) && entry.count > 0,
      ),
  );

/** The project's baseline, or undefined if it is missing or malformed. */
export function readBaseline(root) {
  try {
    const recorded = JSON.parse(readFileSync(join(root, baseline), 'utf8'));

    return isBaseline(recorded) ? recorded : undefined;
  } catch {
    return undefined;
  }
}

const sorted = (object) =>
  Object.fromEntries(Object.entries(object).toSorted(([a], [b]) => (a < b ? -1 : 1)));

/** Where a write to a path ends up, even if it's a symlink to a file that doesn't exist. */
function destination(path) {
  const real = join(realpathSync(dirname(path)), basename(path));

  return lstatSync(real, { throwIfNoEntry: false })?.isSymbolicLink()
    ? destination(resolve(dirname(real), readlinkSync(real)))
    : real;
}

function serialize(entries) {
  const files = Object.entries(entries).map(([file, rules]) => [file, sorted(rules)]);

  return JSON.stringify(sorted(Object.fromEntries(files)), null, 2);
}

function writeComplete(target, scratch, entries) {
  // A link or rename can't cross filesystems, so start beside the file a symlink leads to.
  const beside = dirname(target) === realpathSync(dirname(scratch));
  const complete = join(beside ? scratch : createScratch(dirname(target)), baseline);

  writeFileSync(complete, serialize(entries));

  return complete;
}

/** Create the project's baseline in one step. Throws EEXIST if there is one. */
export function createBaseline(root, scratch, entries) {
  const target = destination(join(root, baseline));
  const complete = writeComplete(target, scratch, entries);

  try {
    linkSync(complete, target);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw error;
    }

    // A filesystem without hard links: copy, and still keep a file that is already there.
    copyFileSync(complete, target, constants.COPYFILE_EXCL);
  }
}

/**
 * Replace the project's baseline, in one step where its directory allows, keeping its permissions,
 * or the file it links to if it's a symlink. Throws if it is read-only.
 */
export function publishBaseline(root, scratch, entries) {
  const target = destination(join(root, baseline));
  const replaced = statSync(target, { throwIfNoEntry: false });

  if (replaced !== undefined) {
    accessSync(target, constants.W_OK);
  }

  let complete;

  try {
    complete = writeComplete(target, scratch, entries);
  } catch (error) {
    if (replaced === undefined || error.code !== 'EACCES') {
      throw error;
    }

    // A writable file in a read-only directory: write it in place, as Oxlint does.
    writeFileSync(target, serialize(entries));

    return;
  }

  if (replaced !== undefined) {
    chmodSync(complete, replaced.mode);
  }

  renameSync(complete, target);
}
