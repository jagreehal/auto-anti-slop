// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { resolveVariable } from '../anti-slop/shared/scope.js';

const fieldTypes = new Set(['AccessorProperty', 'PropertyDefinition']);
const functionTypes = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const mutableCollections = new Set(['Array', 'Map', 'Set']);

function isGlobalCollection(sourceCode, node) {
  if (node.type !== 'Identifier' || !mutableCollections.has(node.name)) {
    return false;
  }

  const variable = resolveVariable(sourceCode, node);

  return variable === null || variable.defs.length === 0;
}

function isMutableType(sourceCode, type) {
  switch (type.type) {
    case 'TSArrayType':
    case 'TSTupleType':
      return true;
    case 'TSTypeReference':
      return isGlobalCollection(sourceCode, type.typeName);
    case 'TSUnionType':
      return type.types.some((member) => isMutableType(sourceCode, member));
    default:
      return false;
  }
}

function isMutableCollection(sourceCode, { typeAnnotation, value }) {
  if (typeAnnotation) {
    return isMutableType(sourceCode, typeAnnotation.typeAnnotation);
  }

  return (
    value?.type === 'ArrayExpression' ||
    (value?.type === 'NewExpression' && isGlobalCollection(sourceCode, value.callee))
  );
}

/** A constructor parameter property, in the form of a declared field. */
function parameterField({ accessibility, decorators, parameter, readonly }) {
  const hasDefault = parameter.type === 'AssignmentPattern';
  const key = hasDefault ? parameter.left : parameter;
  const value = hasDefault ? parameter.right : null;

  return { accessibility, decorators, key, readonly, typeAnnotation: key.typeAnnotation, value };
}

function fieldsOf(members) {
  const declared = members.filter(
    (member) => fieldTypes.has(member.type) && !functionTypes.has(member.value?.type),
  );

  const parameters = members.flatMap((member) =>
    member.kind === 'constructor' ? member.value.params : [],
  );

  return [
    ...declared,
    ...parameters.flatMap((parameter) =>
      parameter.type === 'TSParameterProperty' ? [parameterField(parameter)] : [],
    ),
  ];
}

const isPrivate = ({ accessibility, key }) =>
  key.type === 'PrivateIdentifier' || accessibility === 'private' || accessibility === 'protected';

/** A property's name, marked `#` if private or `.` if not; null if only known at run time. */
function staticName(key, computed) {
  switch (key.type) {
    case 'PrivateIdentifier':
      return `#${key.name}`;
    case 'Identifier':
      return computed ? null : `.${key.name}`;
    case 'Literal':
      return `.${key.value}`;
    case 'TemplateLiteral':
      return key.expressions.length === 0 ? `.${key.quasis[0].value.cooked}` : null;
    default:
      return null;
  }
}

/**
 * Whether a node is `this.name` for one of the fields. An accessor, or a field a decorator turns
 * into one, could copy or check its value.
 */
function isThisField(node, fields) {
  if (node?.type !== 'MemberExpression' || node.object.type !== 'ThisExpression') {
    return false;
  }

  const name = staticName(node.property, node.computed);

  return (
    name !== null &&
    fields.some(
      ({ computed, decorators, key }) =>
        decorators.length === 0 && staticName(key, computed) === name,
    )
  );
}

function onlyStatement(method) {
  const statements = method.value.body?.body ?? [];

  return statements.length === 1 ? statements[0] : undefined;
}

/** `get items(): Array<T> { return this.#items; }` lends the private collection itself. */
function lendsCollection(sourceCode, method, fields) {
  const statement = onlyStatement(method);

  return (
    statement?.type === 'ReturnStatement' &&
    isThisField(statement.argument, fields) &&
    isMutableCollection(sourceCode, { typeAnnotation: method.value.returnType })
  );
}

/** `set limit(value) { this.#limit = value; }` writes the private field unchecked. */
function isPassThroughSetter(method, fields) {
  const assignment = onlyStatement(method)?.expression;

  return (
    assignment?.operator === '=' &&
    isThisField(assignment.left, fields) &&
    assignment.right.type === 'Identifier' &&
    assignment.right.name === method.value.params[0]?.name
  );
}

function methodProblem(sourceCode, method, fields) {
  if (method.kind === 'set' && isPassThroughSetter(method, fields)) {
    return 'mutableField';
  }

  return method.kind === 'get' && lendsCollection(sourceCode, method, fields)
    ? 'mutableCollection'
    : null;
}

function fieldProblem(sourceCode, field) {
  if (!field.readonly) {
    return 'mutableField';
  }

  return isMutableCollection(sourceCode, field) ? 'mutableCollection' : null;
}

/** The class's public members, each with its problem, if the class keeps some state private. */
function exposedMembers(sourceCode, node) {
  const members = node.body.body.filter((member) => !member.static);
  const fields = fieldsOf(members);
  const methods = members.filter((member) => member.type === 'MethodDefinition');

  const guardsState =
    fields.some((field) => isPrivate(field)) &&
    methods.some((method) => method.kind === 'method' && method.value.body !== null);

  if (!guardsState) {
    return [];
  }

  return [
    ...fields.map((member) => ({ member, problem: fieldProblem(sourceCode, member) })),
    ...methods.map((member) => ({ member, problem: methodProblem(sourceCode, member, fields) })),
  ].filter(
    ({ member, problem }) =>
      problem !== null && !isPrivate(member) && member.decorators.length === 0,
  );
}

/** Reports public state on a class that guards the rest of its state. */
export const noExposedMutableFieldRule = {
  createOnce(context) {
    function check(node) {
      // A framework reads decorated classes' fields; a subclass can't narrow a field its base declares.
      if (node.declare || node.superClass !== null || node.decorators.length > 0) {
        return;
      }

      for (const { member, problem } of exposedMembers(context.sourceCode, node)) {
        const { key } = member;
        const name = key.name ?? context.sourceCode.getText(key);

        context.report({ data: { name }, messageId: problem, node: key });
      }
    }

    return { ClassDeclaration: check, ClassExpression: check };
  },
  meta: {
    docs: {
      description:
        'Disallow publicly writable state on a class that keeps other state private and has methods.',
    },
    messages: {
      mutableCollection:
        'Callers can change the contents of "{{name}}", though this class keeps other state private. Work out what callers do with it and give them a method for that; if they only read it, expose a ReadonlyArray, ReadonlyMap or ReadonlySet.',
      mutableField:
        'Any caller can change "{{name}}", though this class keeps other state private. Work out what callers do with it and give them a method for that. If they only read it, make it readonly, or private with a getter when the class itself reassigns it.',
    },
    type: 'problem',
  },
};
