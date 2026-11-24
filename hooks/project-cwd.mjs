// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Preloaded into an Oxlint that starts in a scratch directory. Oxlint looks up its baseline there,
// then imports configs and plugins by absolute URL. Return to the project before the first import,
// so configs see the working directory of a normal lint.

import { registerHooks } from 'node:module';
import { basename, dirname } from 'node:path';
import { isMainThread } from 'node:worker_threads';

const scratch = process.cwd();

// Workers and child processes inherit this preload, and start in the project.
if (isMainThread && basename(scratch).startsWith('.oxlint-baseline-')) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      // Only the program itself has no parent.
      if (specifier.startsWith('file:') && context.parentURL !== undefined) {
        process.chdir(dirname(scratch));
      }

      return nextResolve(specifier, context);
    },
  });
}
