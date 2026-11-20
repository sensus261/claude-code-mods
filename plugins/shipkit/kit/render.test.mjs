// node --test plugins/shipkit/kit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { apply, plan, renderAll, renderText, setBlock, validateConfig } from './render.mjs'

const KIT = path.dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------------ templating

test('conditionals keep or drop text, and a tag alone on its line takes the line', () => {
  const t = 'a\n{{#if qa}}\nqa line\n{{/if}}\nb {{#if tour}}tour{{else}}no tour{{/if}} c\n{{#unless qa}}\nplain\n{{/unless}}\nd\n'
  assert.equal(renderText(t, {}, new Set(['qa'])), 'a\nqa line\nb no tour c\nd\n')
  assert.equal(renderText(t, {}, new Set(['tour'])), 'a\nb tour c\nplain\nd\n')
})

test('nested conditionals', () => {
  const t = '{{#if a}}A{{#if b}}B{{else}}b{{/if}}{{/if}}.'
  assert.equal(renderText(t, {}, new Set(['a', 'b'])), 'AB.')
  assert.equal(renderText(t, {}, new Set(['a'])), 'Ab.')
  assert.equal(renderText(t, {}, new Set(['b'])), '.')
})

test('placeholders are filled, an unknown one is an error, single braces pass through', () => {
  assert.equal(renderText('/{{prefix}}:ship {owner}/{repo} ${1:-{{base}}}', { prefix: 'x', base: 'main' }, new Set()), '/x:ship {owner}/{repo} ${1:-main}')
  assert.throws(() => renderText('{{nope}}', {}, new Set()), /unknown placeholder/)
})

test('unbalanced tags are errors', () => {
  assert.throws(() => renderText('{{#if a}}x', {}, new Set()), /unclosed/)
  assert.throws(() => renderText('x{{/if}}', {}, new Set()), /unbalanced/)
  assert.throws(() => renderText('{{#if a}}x{{/unless}}', {}, new Set()), /unbalanced/)
  assert.throws(() => renderText('{{else}}', {}, new Set()), /stray/)
})

test('config validation', () => {
  assert.deepEqual(validateConfig({ prefix: 'hunter', base: 'main', host: 'github', mode: 'hidden', packs: ['core', 'qa', 'tour'] }), [])
  const errors = validateConfig({ prefix: 'Bad Name', base: '', host: 'bitbucket', mode: 'x', packs: ['tour'] })
  assert.equal(errors.length, 6)
})

// ------------------------------------------------------------------ every real template renders

test('every template renders in every pack and host combination, with no placeholder left', () => {
  for (const host of ['github', 'gitlab']) {
    for (const packs of [['core'], ['core', 'qa'], ['core', 'qa', 'tour']]) {
      const { files } = renderAll({ prefix: 'demo', base: 'main', host, mode: 'committed', packs }, KIT)
      for (const f of files) {
        if (f.src.startsWith('shared/tour/')) continue
        assert.doesNotMatch(f.content, /\{\{[A-Za-z#/][^}]*\}\}/, `${f.src} (${host}, ${packs})`)
        if (!packs.includes('qa')) assert.doesNotMatch(f.content, /run-playbook|QA-RESULTS|test-playbook\.md/, `${f.src} leaks qa`)
        if (!packs.includes('tour')) assert.doesNotMatch(f.content, /pr-tour|guided-tour|tour\.md|demo\.mjs|Demo mode|part-<N>\.mjs/, `${f.src} leaks tour`)
        if (host === 'gitlab') assert.doesNotMatch(f.content, /\bgh (pr|issue|api|run|label|release|repo|auth)\b/, `${f.src} leaks gh`)
      }
      const dests = files.map((f) => f.dest)
      assert.equal(new Set(dests).size, dests.length, 'one file per destination')
      assert.ok(dests.includes('.claude/demo-shared/host.md'))
    }
  }
})

test('every command a template cites exists in the same packs', () => {
  const { files } = renderAll({ prefix: 'demo', base: 'main', host: 'github', mode: 'committed', packs: ['core'] }, KIT)
  const commands = new Set(files.filter((f) => f.dest.startsWith('.claude/commands/')).map((f) => path.basename(f.dest, '.md').replace(/^demo:/, '')))
  for (const f of files) {
    // `<!-- /demo:pr-notes -->` is a marker, not a command.
    for (const [, name] of f.content.matchAll(/(?<!<!-- )\/demo:([a-z-]+)/g)) assert.ok(commands.has(name), `${f.src} cites /demo:${name}`)
  }
})

test('every shared file a template cites is generated or is a profile file', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(KIT, 'manifest.json'), 'utf8'))
  const cfg = { prefix: 'demo', base: 'main', host: 'gitlab', mode: 'committed', packs: ['core', 'qa', 'tour'] }
  const { files } = renderAll(cfg, KIT)
  const known = new Set([...files.map((f) => path.basename(f.dest)), ...Object.values(manifest.profile).flat().map((p) => path.basename(p)), 'shipkit.json'])
  // Scratch files the commands write under .claude/.tmp/ are cited by name too.
  for (const f of files) for (const [, name] of f.content.matchAll(/\.claude\/\.tmp\/([a-z-]+\.md)/g)) known.add(name)
  for (const f of files) {
    if (f.src.startsWith('shared/tour/')) continue
    for (const [, name] of f.content.matchAll(/`(?:\.claude\/demo-shared\/)?([a-z-]+\.md)`/g)) {
      if (/^(ISSUE|PRD|PRE)/i.test(name) || ['CLAUDE.md', 'README.md'].includes(name)) continue
      assert.ok(known.has(name), `${f.src} cites ${name}`)
    }
  }
})

// ------------------------------------------------------------------ plan / apply on a scratch repo

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipkit-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

function scratchKit(files) {
  const kit = fs.mkdtempSync(path.join(os.tmpdir(), 'shipkit-kit-'))
  const templates = []
  for (const [src, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(kit, 'templates', src)), { recursive: true })
    fs.writeFileSync(path.join(kit, 'templates', src), body)
    templates.push({ src, dest: src.startsWith('commands/') ? `.claude/commands/{{prefix}}:${path.basename(src)}` : `{{shared}}/${path.basename(src)}`, pack: 'core' })
  }
  fs.writeFileSync(path.join(kit, 'manifest.json'), JSON.stringify({ version: '9.9.9', profile: { core: [] }, templates }))
  return kit
}

const CFG = { prefix: 'p', base: 'main', host: 'github', mode: 'committed', packs: ['core'] }
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const statuses = (p) => Object.fromEntries(p.files.map((r) => [r.dest, r.status]))
const reload = (root) => JSON.parse(read(root, '.claude/p-shared/shipkit.json'))

test('install, hand edit, template change: update, keep, 3-way merge, conflict', () => {
  const root = scratchRepo()
  const kit = scratchKit({
    'commands/a.md': 'one\ntwo\nthree\nfour\nfive\n',
    'commands/b.md': 'b1\nb2\n',
    'shared/c.md': 'c for {{prefix}}\n',
  })
  let r = apply(root, CFG, kit)
  assert.deepEqual(r.done.map((d) => d.did), ['created', 'created', 'created'])
  assert.equal(read(root, '.claude/p-shared/c.md'), 'c for p\n')
  let cfg = reload(root)
  assert.equal(cfg.shipkit, '9.9.9')
  assert.ok(read(root, '.gitignore').includes('# >>> shipkit:p'))

  // The user edits a.md (top) and b.md; the kit then changes a.md (bottom), b.md (same line) and c.md.
  fs.writeFileSync(path.join(root, '.claude/commands/p:a.md'), 'ONE\ntwo\nthree\nfour\nfive\n')
  fs.writeFileSync(path.join(root, '.claude/commands/p:b.md'), 'b1 mine\nb2\n')
  fs.writeFileSync(path.join(kit, 'templates/commands/a.md'), 'one\ntwo\nthree\nfour\nFIVE\n')
  fs.writeFileSync(path.join(kit, 'templates/commands/b.md'), 'b1 theirs\nb2\n')
  fs.writeFileSync(path.join(kit, 'templates/shared/c.md'), 'c2 for {{prefix}}\n')

  const p = plan(root, cfg, kit)
  assert.deepEqual(statuses(p), {
    '.claude/commands/p:a.md': 'merged',
    '.claude/commands/p:b.md': 'conflict',
    '.claude/p-shared/c.md': 'update',
  })
  assert.match(fs.readFileSync(p.files.find((x) => x.status === 'conflict').merge, 'utf8'), /<<<<<<< yours/)

  r = apply(root, cfg, kit)
  assert.equal(read(root, '.claude/commands/p:a.md'), 'ONE\ntwo\nthree\nfour\nFIVE\n')
  assert.equal(read(root, '.claude/p-shared/c.md'), 'c2 for p\n')
  assert.equal(read(root, '.claude/commands/p:b.md'), 'b1 mine\nb2\n', 'a conflict is never written over')
  assert.deepEqual(r.pending.map((x) => x.dest), ['.claude/commands/p:b.md'])

  // Resolve by hand, then keep: the next plan sees it as a kept edit.
  fs.writeFileSync(path.join(root, '.claude/commands/p:b.md'), 'b1 mine and theirs\nb2\n')
  cfg = reload(root)
  apply(root, cfg, kit, { keep: ['.claude/commands/p:b.md'] })
  cfg = reload(root)
  assert.deepEqual(statuses(plan(root, cfg, kit)), {
    '.claude/commands/p:a.md': 'kept',
    '.claude/commands/p:b.md': 'kept',
    '.claude/p-shared/c.md': 'same',
  })
})

test('adopt, removed, skip, orphan and unmanaged', () => {
  const root = scratchRepo()
  const kit = scratchKit({ 'commands/a.md': 'a\n', 'commands/b.md': 'b\n' })
  fs.mkdirSync(path.join(root, '.claude/commands'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/commands/p:a.md'), 'legacy a\n')
  fs.writeFileSync(path.join(root, '.claude/commands/p:old.md'), 'legacy old\n')
  fs.writeFileSync(path.join(root, '.claude/commands/other.md'), 'not ours\n')

  let p = plan(root, CFG, kit)
  assert.deepEqual(statuses(p), {
    '.claude/commands/p:a.md': 'adopt',
    '.claude/commands/p:b.md': 'new',
    '.claude/commands/p:old.md': 'unmanaged',
  })
  apply(root, CFG, kit, { take: ['.claude/commands/p:a.md'], remove: ['.claude/commands/p:old.md'] })
  assert.equal(read(root, '.claude/commands/p:a.md'), 'a\n')
  assert.ok(!fs.existsSync(path.join(root, '.claude/commands/p:old.md')))
  assert.ok(fs.existsSync(path.join(root, '.claude/commands/other.md')), 'never touches files outside the prefix')

  // Deleted by hand → removed; skip it for good.
  fs.rmSync(path.join(root, '.claude/commands/p:b.md'))
  let cfg = reload(root)
  assert.equal(statuses(plan(root, cfg, kit))['.claude/commands/p:b.md'], 'removed')
  apply(root, cfg, kit, { skip: ['.claude/commands/p:b.md'] })
  cfg = reload(root)
  assert.deepEqual(cfg.skip, ['.claude/commands/p:b.md'])
  assert.equal(statuses(plan(root, cfg, kit))['.claude/commands/p:b.md'], 'skipped')

  // The kit drops a.md → orphan; keep it as the user's own.
  const manifest = JSON.parse(read(kit, 'manifest.json'))
  manifest.templates = manifest.templates.filter((t) => t.src !== 'commands/a.md')
  fs.writeFileSync(path.join(kit, 'manifest.json'), JSON.stringify(manifest))
  assert.equal(statuses(plan(root, cfg, kit))['.claude/commands/p:a.md'], 'orphan')
  apply(root, cfg, kit, { keep: ['.claude/commands/p:a.md'] })
  cfg = reload(root)
  assert.deepEqual(cfg.keep, ['.claude/commands/p:a.md'])
  assert.equal(cfg.files['.claude/commands/p:a.md'], undefined)
  assert.equal(statuses(plan(root, cfg, kit))['.claude/commands/p:a.md'], undefined, 'a kept file is not asked about again')
})

test('hidden mode lists everything in .git/info/exclude; switching back moves the block', () => {
  const root = scratchRepo()
  const kit = scratchKit({ 'commands/a.md': 'a\n' })
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n')
  apply(root, { ...CFG, mode: 'hidden' }, kit)
  const exclude = read(root, '.git/info/exclude')
  assert.match(exclude, /\.claude\/commands\/p:\*\.md/)
  assert.match(exclude, /\.claude\/p-shared\//)
  assert.equal(read(root, '.gitignore'), 'node_modules/\n')
  assert.equal(execFileSync('git', ['status', '--porcelain', '--', '.claude'], { cwd: root }).toString(), '')

  apply(root, { ...reload(root), mode: 'committed' }, kit)
  assert.doesNotMatch(read(root, '.git/info/exclude'), /shipkit:p/)
  assert.match(read(root, '.gitignore'), /^node_modules\/\n\n# >>> shipkit:p .*\n\.claude\/\.tmp\/\n/)
  assert.doesNotMatch(read(root, '.gitignore'), /\.claude\/commands/)
})

test('the ignore block is replaced in place, not duplicated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipkit-block-'))
  const f = path.join(dir, '.gitignore')
  fs.writeFileSync(f, 'a\n')
  setBlock(f, 'p', ['x/'], '(note)')
  setBlock(f, 'p', ['y/'], '(note)')
  setBlock(f, 'q', ['z/'], '(note)')
  assert.equal(fs.readFileSync(f, 'utf8'), 'a\n\n# >>> shipkit:p (note)\ny/\n# <<< shipkit:p\n\n# >>> shipkit:q (note)\nz/\n# <<< shipkit:q\n')
  setBlock(f, 'p', null, '')
  assert.equal(fs.readFileSync(f, 'utf8'), 'a\n\n# >>> shipkit:q (note)\nz/\n# <<< shipkit:q\n')
})

test('scripts keep their mode', () => {
  const root = scratchRepo()
  const { files } = renderAll({ ...CFG, packs: ['core', 'qa', 'tour'] }, KIT)
  assert.equal(files.find((f) => f.src === 'shared/tour/chrome.sh').mode, '755')
  apply(root, { ...CFG, packs: ['core', 'qa', 'tour'] }, KIT)
  assert.ok(fs.statSync(path.join(root, '.claude/p-shared/tour/chrome.sh')).mode & 0o100)
})

test('the tour scripts parse, and every script they import is generated next to them', () => {
  const { files } = renderAll({ ...CFG, packs: ['core', 'qa', 'tour'] }, KIT)
  const tour = files.filter((f) => f.src.startsWith('shared/tour/'))
  const names = new Set(tour.map((f) => path.basename(f.dest)))
  for (const f of tour.filter((x) => /\.(mjs|js)$/.test(x.src))) {
    execFileSync(process.execPath, ['--check', path.join(KIT, 'templates', f.src)])
    for (const [, name] of f.content.matchAll(/from '\.\/([^']+)'/g)) assert.ok(names.has(name), `${f.src} imports ./${name}`)
    for (const [, name] of f.content.matchAll(/join\(HERE, '([^']+\.(?:js|mjs|sh))'\)/g)) assert.ok(names.has(name), `${f.src} reads ${name}`)
  }
  for (const name of ['open.mjs', 'demo.mjs', 'tour-control.mjs', 'surfaces.mjs', 'tour-panel.js', 'chrome.sh']) assert.ok(names.has(name), name)
})

test('the panel knows the three modes the scripts ask for', () => {
  const panel = fs.readFileSync(path.join(KIT, 'templates/shared/tour/tour-panel.js'), 'utf8')
  const control = fs.readFileSync(path.join(KIT, 'templates/shared/tour/tour-control.mjs'), 'utf8')
  for (const mode of ['docked', 'ring']) {
    assert.match(control, new RegExp(`__tourMode = '${mode}'`))
    assert.match(panel, new RegExp(`mode === '${mode}'`))
  }
  assert.match(panel, /__tourMode \?\? 'overlay'/)
})
