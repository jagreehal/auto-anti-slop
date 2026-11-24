# Vendored padding-line-between-statements

Adapted from ESLint Stylistic, under the MIT license in `LICENSE`. Keep `LICENSE` with every copy.

## Local adaptations

- Oxlint's ESTree, context, token and rule types replace the upstream types, and string literals replace `AST_NODE_TYPES`.
- Indexed reads are guarded, so the code passes `noUncheckedIndexedAccess`.
- `createPaddingLineRule(options, statementTypes?)` replaces the upstream `createRule` factory. The optional second argument registers extra statement types, such as exported bindings.
- `padding-line-ast.js` implements the AST helpers the rule needs with Oxlint's source-code and token API.

`../../rules/require-readable-spacing.js` sets the spacing policy and `../../rules/require-readable-spacing.test.js` tests it.
