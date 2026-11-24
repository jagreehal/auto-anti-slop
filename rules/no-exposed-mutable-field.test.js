// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import { noExposedMutableFieldRule } from './no-exposed-mutable-field.js';

RuleTester.describe = describe;

RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const guarded = (members) => `class Queue { #head = 0; size() { return this.#head; } ${members} }`;
const field = (name) => ({ messageId: 'mutableField', data: { name } });
const collection = (name) => ({ messageId: 'mutableCollection', data: { name } });

tester.run('anti-slop/no-exposed-mutable-field', noExposedMutableFieldRule, {
  valid: [
    // Nothing kept private, or no method: plain data.
    'class Point { x = 0; y = 0; norm() { return this.x; } }',
    'class Point { private x = 0; y = 0; }',
    guarded('readonly limit = 10; private items: string[] = []; protected seen = new Set();'),
    guarded('readonly items: ReadonlyArray<string> = []; readonly seen: readonly string[] = [];'),
    guarded("readonly kinds = ['a'] as const; static shared: string[] = [];"),
    guarded('handle = () => this.size(); constructor(readonly name: string) {}'),
    guarded('get items(): ReadonlyArray<string> { return this.#items; } #items: string[] = [];'),
    guarded('get items(): string[] { return [...this.#items]; } #items: string[] = [];'),
    guarded('set head(value: number) { this.#head = Math.max(0, value); }'),
    guarded('@property() label = "";'),
    "import { Map } from 'immutable'; " + guarded('readonly seen: Map<string, number> = Map();'),
    'class View extends Component { #timer = 0; state = {}; render() { return this.#timer; } }',
    guarded('#count = 0; get count(): number { return this.#count; }'),
    guarded('readonly items: ReadonlyArray<string> | undefined;'),
    '@Component({}) class View { #timer = 0; title = ""; render() { return this.#timer; } }',
    'declare class Queue { #head: number; items: string[]; size(): number; }',
    // Forwarding to an accessor that copies or checks the value keeps the field private.
    guarded(
      'get items(): string[] { return this.#copy; } get #copy() { return [...this.#items]; } #items: string[] = [];',
    ),
    guarded(
      'set head(value: number) { this.checked = value; } private set checked(value: number) { this.#head = Math.max(0, value); }',
    ),
    guarded('get items(): string[] { throw this.#error; } #error = new Error("closed");'),
    guarded('static #items: string[] = []; get items(): string[] { return this.#items; }'),
    // A decorator can check or copy the value.
    guarded('@clamp accessor #level = 0; set level(value: number) { this.#level = value; }'),
    guarded('@observable private list: string[] = []; get items(): string[] { return this.list; }'),
    // A computed key is another property, or unknown.
    'const snapshot = Symbol("s"); ' +
      guarded(
        'private [snapshot]: string[] = []; get items(): string[] { return this.snapshot; } get snapshot(): string[] { return [...this[snapshot]]; }',
      ),
    guarded('private list: string[] = []; get items(): string[] { return this[list]; }'),
    guarded("#list: string[] = []; get items(): string[] { return this['#list']; }"),
  ],
  invalid: [
    { code: guarded('items: string[] = [];'), errors: [field('items')] },
    { code: guarded('public count = 0;'), errors: [field('count')] },
    { code: guarded('constructor(public limit: number) {}'), errors: [field('limit')] },
    { code: guarded('constructor(public limit = 1) {}'), errors: [field('limit')] },
    {
      code: 'class Queue { constructor(private head: number, public items: string[]) {} size() {} }',
      errors: [field('items')],
    },
    { code: guarded('readonly items: string[] = [];'), errors: [collection('items')] },
    { code: guarded('readonly items = [];'), errors: [collection('items')] },
    { code: guarded('readonly seen = new Set<string>();'), errors: [collection('seen')] },
    { code: guarded('readonly seen: Map<string, number>;'), errors: [collection('seen')] },
    {
      code: guarded('get items(): Array<string> { return this.#items; } #items: string[] = [];'),
      errors: [collection('items')],
    },
    {
      code: guarded('set head(value: number) { this.#head = value; }'),
      errors: [field('head')],
    },
    {
      code: guarded('get items(): string[] { return this.list; } private list: string[] = [];'),
      errors: [collection('items')],
    },
    {
      code: guarded(
        'get items(): string[] { return this.list; } constructor(private list: string[]) {}',
      ),
      errors: [collection('items')],
    },
    ...["this['list']", 'this[`list`]'].map((list) => ({
      code: guarded(`get items(): string[] { return ${list}; } private list: string[] = [];`),
      errors: [collection('items')],
    })),
    {
      code: guarded("get items(): string[] { return this.list; } private 'list': string[] = [];"),
      errors: [collection('items')],
    },
    {
      code: guarded("set limit(value: number) { this['max'] = value; } private max = 1;"),
      errors: [field('limit')],
    },
    { code: guarded('accessor count = 0;'), errors: [field('count')] },
    { code: guarded('readonly items: Array<string> | undefined;'), errors: [collection('items')] },
    { code: 'const Queue = ' + guarded('count = 0;'), errors: [field('count')] },
  ],
});
