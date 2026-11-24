import createPaddingLineRule from '../vendor/eslint-stylistic/padding-line-between-statements.js';
/** A `const`/`let`/`var`/`using` declaration, optionally exported, written on one line. */
function isSinglelineBinding(node) {
  const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
  return declaration?.type === 'VariableDeclaration' && node.loc.start.line === node.loc.end.line;
}
/** Comments above a statement belong to it; a comment trailing the previous line does not. */
function hasLeadingComment(node, sourceCode) {
  const previousLine = sourceCode.getTokenBefore(node)?.loc.end.line;
  return sourceCode
    .getCommentsBefore(node)
    .some((comment) => comment.loc.start.line !== previousLine);
}
/** `export { a } from './a';` or `export * from './a';` on one line. */
function isSinglelineReExport(node) {
  return (
    (node.type === 'ExportAllDeclaration' ||
      (node.type === 'ExportNamedDeclaration' && node.source !== null)) &&
    node.loc.start.line === node.loc.end.line
  );
}
const singlelineReExport = {
  test: (node) => isSinglelineReExport(node),
};
const undocumentedSinglelineReExport = {
  test: (node, sourceCode) => isSinglelineReExport(node) && !hasLeadingComment(node, sourceCode),
};
const singlelineBinding = {
  test: (node) => isSinglelineBinding(node),
};
const undocumentedSinglelineBinding = {
  test: (node, sourceCode) => isSinglelineBinding(node) && !hasLeadingComment(node, sourceCode),
};
const paddingRule = createPaddingLineRule(
  [
    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'always', prev: '*', next: { selector: 'Program > :not(ImportDeclaration)' } },
    { blankLine: 'always', prev: { selector: 'Program > :not(ImportDeclaration)' }, next: '*' },
    { blankLine: 'always', prev: '*', next: ['function', 'class', 'interface', 'type'] },
    { blankLine: 'always', prev: ['function', 'class', 'interface', 'type'], next: '*' },
    {
      blankLine: 'always',
      prev: '*',
      next: ['multiline-const', 'multiline-let', 'multiline-var', 'multiline-using'],
    },
    {
      blankLine: 'always',
      prev: ['multiline-const', 'multiline-let', 'multiline-var', 'multiline-using'],
      next: '*',
    },
    {
      blankLine: 'always',
      prev: '*',
      next: ['return', 'if', 'switch', 'try', 'for', 'while', 'do'],
    },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },
    // Consecutive single-line bindings form one group at any scope, including
    // module scope. A binding with its own leading comment starts a new group.
    { blankLine: 'any', prev: 'singleline-binding', next: 'undocumented-singleline-binding' },
    // Consecutive single-line re-exports group the same way.
    {
      blankLine: 'any',
      prev: 'singleline-re-export',
      next: 'undocumented-singleline-re-export',
    },
    {
      blankLine: 'any',
      prev: {
        selector:
          ':matches(TSDeclareFunction, ExportNamedDeclaration[declaration.type="TSDeclareFunction"])',
      },
      next: {
        selector:
          ':matches(TSDeclareFunction, FunctionDeclaration, ExportNamedDeclaration[declaration.type="TSDeclareFunction"], ExportNamedDeclaration[declaration.type="FunctionDeclaration"])',
      },
    },
  ],
  {
    'singleline-binding': singlelineBinding,
    'undocumented-singleline-binding': undocumentedSinglelineBinding,
    'singleline-re-export': singlelineReExport,
    'undocumented-singleline-re-export': undocumentedSinglelineReExport,
  },
);
/** Restore structural blank lines with whitespace-only fixes; keep single-line binding groups and overloads grouped. */
export const requireReadableSpacingRule = {
  ...paddingRule,
  meta: {
    ...paddingRule.meta,
    docs: {
      description: 'Require readable spacing between declarations and logical statement groups.',
    },
    schema: [],
  },
};
