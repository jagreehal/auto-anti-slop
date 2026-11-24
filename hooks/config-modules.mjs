// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Preloaded into `oxlint --print-config`. Reports when each file the config loads or reads was
// last modified, so setup can tell that one was rewritten, even with the same content.

import fs, { statSync, writeSync } from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';

// Flags can be omitted, with a callback in their place, or be a number, or a name: those that
// can read have an `r` or a `+`.
const isRead = (flags = 'r') =>
  Number.isInteger(flags)
    ? flags % 4 !== fs.constants.O_WRONLY
    : flags?.call !== undefined || /[r+]/.test(String(flags));

if (isMainThread) {
  const modified = {};

  const record = (path) => {
    try {
      const file = path instanceof URL ? fileURLToPath(path) : resolve(String(path));

      modified[file] = statSync(file, { throwIfNoEntry: false })?.mtimeMs;
    } catch {
      // Not a file: the caller reports it as it would without this preload.
    }
  };

  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith('file:')) {
        record(new URL(url));
      }

      return nextLoad(url, context);
    },
  });

  // Reads through Node's `fs`. Streams and file handles open their file with `open`.
  for (const [owner, method] of [
    [fs, 'readFileSync'],
    [fs, 'readFile'],
    [fs.promises, 'readFile'],
    [fs, 'openSync'],
    [fs, 'open'],
    [fs.promises, 'open'],
  ]) {
    const read = owner[method];

    owner[method] = (path, ...rest) => {
      // Not a file descriptor, or a file opened only to write.
      if (!Number.isInteger(path) && (!method.startsWith('open') || isRead(rest[0]))) {
        record(path);
      }

      return read(path, ...rest);
    };
  }

  syncBuiltinESMExports();

  process.on('exit', () => writeSync(2, `\nconfig-modules ${JSON.stringify(modified)}\n`));
}
