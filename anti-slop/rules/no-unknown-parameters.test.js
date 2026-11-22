import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

RuleTester.describe = describe;
RuleTester.it = it;
import { noUnknownParametersRule } from './no-unknown-parameters.js';
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const error = { messageId: 'unknownParameter' };
tester.run('anti-slop/no-unknown-parameters', noUnknownParametersRule, {
  valid: [
    'function enrich(cause: unknown): void {}',
    'function enrich(cause: Error | unknown): void {}',
    'function isString(value: unknown): value is string { return true; }',
    'const isString = (value: unknown): value is string => true;',
    'function assertString(value: unknown): asserts value is string {}',
    'type Guard = (value: unknown) => value is string;',
    'declare function isString(value: unknown): value is string;',
    'type Guards = { isString(value: unknown): value is string };',
    'function parse(value: string | number): void {}',
    // Local deviation: promise rejection handlers (see UPSTREAM.md).
    'promise.catch((error: unknown) => String(error));',
    'promise?.catch(function (error: unknown) {});',
    'promise.then(String, (error: unknown) => String(error));',
  ],
  invalid: [
    { code: 'function parse(value: unknown): void {}', errors: [error] },
    { code: 'promise.then((value: unknown) => value);', errors: [error] },
    { code: 'promise.finally((value: unknown) => value);', errors: [error] },
    { code: 'promise["catch"]((error: unknown) => error);', errors: [error] },
    { code: 'function parse(value: string | unknown): void {}', errors: [error] },
    {
      code: 'function parse(value: string | (number | unknown)): void {}',
      errors: [error],
    },
    {
      code: 'function isString(value: unknown, context: unknown): value is string { return true; }',
      errors: [{ ...error, data: { parameter: 'context' } }],
    },
    {
      code: 'export function parse({ value }: unknown = {}): void {}',
      errors: [{ ...error, data: { parameter: '{ value }' } }],
    },
  ],
});
