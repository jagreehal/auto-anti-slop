// Every anti-slop rule except the Effect rules, plus our own; see UPSTREAM.md.
import { noExportAllRule } from '../rules/no-export-all.js';
import { noExposedMutableFieldRule } from '../rules/no-exposed-mutable-field.js';
import { noArrayFilterMapRule } from './rules/no-array-filter-map.js';
import { noChainedTypeAssertionsRule } from './rules/no-chained-type-assertions.js';
import { noConditionalEmptyObjectSpreadRule } from './rules/no-conditional-empty-object-spread.js';
import { noKnownValueWideningRule } from './rules/no-known-value-widening.js';
import { noModuleMockingRule } from './rules/no-module-mocking.js';
import { noObjectParametersRule } from './rules/no-object-parameters.js';
import { noReduceAccumulatorCopyRule } from './rules/no-reduce-accumulator-copy.js';
import { noReflectApplyRule } from './rules/no-reflect-apply.js';
import { noReflectGetRule } from './rules/no-reflect-get.js';
import { noRuntimeTypeofRule } from './rules/no-runtime-typeof.js';
import { noForbiddenTermInSymbolNamesRule } from './rules/no-shape-in-symbol-names.js';
import { noUnknownParametersRule } from './rules/no-unknown-parameters.js';
import { noUnknownReturnsRule } from './rules/no-unknown-returns.js';
import { noUnknownTypeAliasesRule } from './rules/no-unknown-type-aliases.js';
import { noUnsafeDictionaryTypeRule } from './rules/no-unsafe-dictionary-type.js';
import { noWidenThenAssertRule } from './rules/no-widen-then-assert.js';
import { requireReadableSpacingRule } from './rules/require-readable-spacing.js';
import { requireSafetyCommentForTypeAssertionRule } from './rules/require-safety-comment-for-type-assertion.js';

export default {
  meta: { name: 'anti-slop' },
  rules: {
    'no-array-filter-map': noArrayFilterMapRule,
    'no-chained-type-assertions': noChainedTypeAssertionsRule,
    'no-conditional-empty-object-spread': noConditionalEmptyObjectSpreadRule,
    'no-export-all': noExportAllRule,
    'no-exposed-mutable-field': noExposedMutableFieldRule,
    'no-known-value-widening': noKnownValueWideningRule,
    'no-module-mocking': noModuleMockingRule,
    'no-object-parameters': noObjectParametersRule,
    'no-reduce-accumulator-copy': noReduceAccumulatorCopyRule,
    'no-reflect-apply': noReflectApplyRule,
    'no-reflect-get': noReflectGetRule,
    'no-runtime-typeof': noRuntimeTypeofRule,
    'no-shape-in-symbol-names': noForbiddenTermInSymbolNamesRule,
    'no-unknown-parameters': noUnknownParametersRule,
    'no-unknown-returns': noUnknownReturnsRule,
    'no-unknown-type-aliases': noUnknownTypeAliasesRule,
    'no-unsafe-dictionary-type': noUnsafeDictionaryTypeRule,
    'no-widen-then-assert': noWidenThenAssertRule,
    'require-readable-spacing': requireReadableSpacingRule,
    'require-safety-comment-for-type-assertion': requireSafetyCommentForTypeAssertionRule,
  },
};
