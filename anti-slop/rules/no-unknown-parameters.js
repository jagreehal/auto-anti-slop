import {
  containsUnknownType,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from '../shared/function-parameters.js';
function isTypePredicateSubject(owner, parameterName) {
  const predicate = owner.returnType?.typeAnnotation;
  return (
    predicate?.type === 'TSTypePredicate' &&
    predicate.parameterName.type === 'Identifier' &&
    predicate.parameterName.name === parameterName
  );
}
// Local deviation: typescript/use-unknown-in-catch-callback-variable requires `unknown` here.
function isPromiseRejectionHandler(node) {
  const call = node.parent;
  if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') return false;
  const { computed, property } = call.callee;
  if (computed || property.type !== 'Identifier') return false;
  const index = call.arguments.indexOf(node);
  return (property.name === 'catch' && index === 0) || (property.name === 'then' && index === 1);
}
/** Disallow unknown inputs except explicitly named error-cause enrichment. */
export const noUnknownParametersRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow explicitly unknown function parameters except `cause` and type-predicate subjects; decode unknown input at its I/O boundary instead.',
    },
    messages: {
      unknownParameter:
        'Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.',
    },
  },
  createOnce(context) {
    const checkParameters = (node) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation === null || annotation === undefined) continue;
        if (!containsUnknownType(annotation.typeAnnotation)) continue;
        const name = functionParameterBindingName(parameter, context.sourceCode);
        if (
          name === 'cause' ||
          isTypePredicateSubject(node, name) ||
          isPromiseRejectionHandler(node)
        ) {
          continue;
        }
        context.report({
          node: annotation.typeAnnotation,
          messageId: 'unknownParameter',
          data: { parameter: name },
        });
      }
    };
    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
};
