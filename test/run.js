// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { spawn } from 'node:child_process';

/** Run a command without blocking the concurrent tests beside it. */
export const run = (command, args, { cwd, env, input = '' }) =>
  new Promise((resolve, reject) => {
    // Run Oxlint standalone, outside the Vite+ mode this test runner sets.
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, VP_VERSION: undefined, ...env },
    });

    const output = { stderr: '', stdout: '' };

    for (const stream of ['stderr', 'stdout']) {
      child[stream].setEncoding('utf8').on('data', (chunk) => {
        output[stream] += chunk;
      });
    }

    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ ...output, status });
    });
    child.stdin.end(input);
  });
