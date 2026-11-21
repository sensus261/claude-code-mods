// The committed-tour logic the agent-free runner stands on (templates/shared/tour/tour-file.mjs).
//   node --test kit/tour.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  fill,
  globToRegExp,
  hasToken,
  isTourId,
  leftovers,
  lint,
  markdown,
  placeholders,
  resolveId,
  stale,
  tourIds,
} from './templates/shared/tour/tour-file.mjs'

const SURFACES = {
  app: { base: 'http://localhost:8000', signin: { path: '/login', fields: {}, submit: 'button' } },
  site: { base: 'http://localhost:4321' },
}

const tour = (over = {}) => ({
  version: 2,
  id: 'issue-7',
  title: '#7 · A member edits a title',
  vars: { ITEM: { what: 'an item the member owns' } },
  touches: ['src/items/**'],
  windows: [{ name: 'Member', surface: 'app', login: 'tour-issue-7-member@example.test', paths: ['/items/{ITEM}'] }],
  steps: [
    { window: 'Member', do: 'Change the title, click `Save`.', see: '`Saved`', highlight: 'Save', touches: ['web/src/pages/DeliveryControllerIntegrationTest.tsx'] },
    { window: 'Member', do: 'Reload.', see: 'the new title', path: '/items/{ITEM}' },
  ],
  ...over,
})

test('a well-formed tour has no errors', () => {
  assert.deepEqual(lint(tour(), 'issue-7', { surfaces: SURFACES }), [])
})

test('lint names what is wrong', () => {
  const bad = tour({
    version: 1,
    id: 'other',
    state: 'ready',
    windows: [{ name: 'Member', surface: 'nope', paths: [] }, { name: 'Member', paths: ['/x'] }],
    steps: [{ window: 'Ghost', do: '', see: 'x {FOO}' }],
  })
  const errors = lint(bad, 'issue-7', { surfaces: SURFACES }).join('\n')
  for (const expected of [
    '"version": 2',
    '"id" is "other"',
    '"state" belongs to the live copy',
    'no surface "nope"',
    'a second window named "Member"',
    '"paths" is empty',
    'every path must be a whole http(s) address',
    'no window named "Ghost"',
    '"do" is missing',
    '{FOO} is used but not declared',
    'vars.ITEM is declared but no window or step uses it',
  ]) assert.match(errors, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), expected)
})

test('lint caps the steps and checks sign-in surfaces', () => {
  const steps = Array.from({ length: 9 }, (_, i) => ({ do: `step ${i}`, see: 'ok' }))
  const errors = lint(tour({ steps, vars: {}, windows: [{ name: 'A', surface: 'site', login: 'x@example.test', paths: ['/'] }] }), 'issue-7', { surfaces: SURFACES }).join('\n')
  assert.match(errors, /9 steps: at most 8/)
  assert.match(errors, /surface "site" has no "signin"/)
})

test('tokens are refused, file names in touches are not', () => {
  assert.equal(hasToken('/approve/aZ9kQ2xW7mN4pL8rT3vY6bC1'), true)
  assert.equal(hasToken('/orders?id=4&token=x'), true)
  assert.equal(hasToken('DeliveryControllerIntegrationTest and order-confirmation-email-template'), false)
  assert.match(lint(tour({ windows: [{ name: 'Member', surface: 'app', paths: ['/a/aZ9kQ2xW7mN4pL8rT3vY6bC1x/{ITEM}'] }] }), 'issue-7').join('\n'), /token/)
  assert.deepEqual(lint(tour({ touches: ['src/Billing/InvoiceNumber2026GeneratorServiceTest.php'] }), 'issue-7'), [])
})

test('tour IDs are names, never only digits', () => {
  assert.ok(isTourId('issue-7'))
  assert.ok(isTourId('A12'))
  assert.ok(!isTourId('118'))
  assert.ok(!isTourId('../x'))
  assert.ok(!isTourId(''))
})

test('globs: ** crosses folders, * stays in one, a trailing / is the whole folder', () => {
  assert.ok(globToRegExp('src/items/**').test('src/items/a/b.ts'))
  assert.ok(globToRegExp('src/**/edit.tsx').test('src/edit.tsx'))
  assert.ok(globToRegExp('src/**/edit.tsx').test('src/pages/items/edit.tsx'))
  assert.ok(!globToRegExp('src/**/edit.tsx').test('src/pages/noedit.tsx'))
  assert.ok(globToRegExp('src/*.ts').test('src/a.ts'))
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'))
  assert.ok(globToRegExp('src/items/').test('src/items/x/y.php'))
  assert.ok(globToRegExp('a.b+c(d).ts').test('a.b+c(d).ts'))
  assert.ok(!globToRegExp('a.ts').test('aXts'))
})

test('stale: tour-wide touches count for every step', () => {
  const t = tour()
  assert.deepEqual(stale(t, ['README.md']).steps.map((s) => s.files), [[], []])
  assert.deepEqual(stale(t, ['web/src/pages/DeliveryControllerIntegrationTest.tsx']).steps.map((s) => s.files.length), [1, 0])
  assert.deepEqual(stale(t, ['src/items/model.ts']).steps.map((s) => s.files), [['src/items/model.ts'], ['src/items/model.ts']])
})

test('fill replaces known vars everywhere and leaves the others', () => {
  const t = tour()
  const filled = fill({ windows: t.windows, steps: t.steps }, { ITEM: 42 })
  assert.deepEqual(filled.windows[0].paths, ['/items/42'])
  assert.equal(filled.steps[1].path, '/items/42')
  assert.deepEqual(leftovers(filled), [])
  assert.deepEqual(leftovers(fill({ a: '/x/{OTHER}' }, { ITEM: 1 })), ['{OTHER}'])
  assert.deepEqual(placeholders(t), ['ITEM'])
})

test('the PR block carries the marker, the run command and the steps', () => {
  const block = markdown(tour({ verifiedOn: 'abc1234', verifiedAt: '2026-11-21' }), 'issue-7', {
    marker: 'acme',
    run: 'npm run tour -- issue-7',
    file: '.claude/acme-shared/tours/issue-7/tour.json',
  })
  assert.match(block, /^<!-- acme:guided-tour -->/)
  assert.match(block, /<!-- \/acme:guided-tour -->$/)
  assert.match(block, /checked on abc1234 \(2026-11-21\)/)
  assert.match(block, /`npm run tour -- issue-7`/)
  assert.match(block, /1\. \[Member · tour-issue-7-member@example\.test\] Change the title/)
  assert.match(block, /- `\{ITEM\}`: an item the member owns/)
})

test('tour folders are found as typed or without regard to case', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipkit-tours-'))
  fs.mkdirSync(path.join(dir, 'A12'))
  fs.writeFileSync(path.join(dir, 'A12', 'tour.json'), '{}')
  fs.mkdirSync(path.join(dir, 'empty'))
  assert.deepEqual(tourIds(dir), ['A12'])
  assert.equal(resolveId(dir, 'a12'), 'A12')
  assert.equal(resolveId(dir, 'empty'), null)
  assert.deepEqual(tourIds(path.join(dir, 'missing')), [])
})
