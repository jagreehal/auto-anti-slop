// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Keeps a module's interface narrower than its code. */
export const noExportAllRule = {
  createOnce(context) {
    return {
      ExportAllDeclaration(node) {
        if (node.source.value.startsWith('.')) {
          context.report({ messageId: 'exportAll', node });
        }
      },
    };
  },
  meta: {
    docs: { description: 'Disallow `export *` from a relative path.' },
    messages: {
      exportAll:
        'This shows callers everything in the module and hides nothing. Export by name only what code outside needs, and keep the rest internal.',
    },
    type: 'problem',
  },
};
