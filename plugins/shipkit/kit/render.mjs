#!/usr/bin/env node
// shipkit renderer: turns kit/templates into one project's .claude toolkit.
//
//   node render.mjs plan   [root] [--config f] [--kit dir]
//   node render.mjs apply  [root] [--take d]… [--keep d]… [--remove d]… [--skip d]… [--unskip d]…
//   node render.mjs render [root] <template-src>        one template, rendered, to stdout
//
// No dependencies. Output is JSON for the forge skill to read. Nothing outside the project
// root is written except the merge bases under the repo's git dir (never committed).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_SCRATCH = [
  '.claude/.tmp/',
  'reports/',
  'PRE-COMMIT-REVIEW-REPORT.md',
  'PRE-MERGE-REVIEW-REPORT.md',
  'ISSUE-*-HANDOFF.md',
  'ISSUE-*-TEST-PLAYBOOK.md',
  'ISSUE-*-QA-RESULTS.md',
]

const HOSTS = {
  github: { PR: 'PR', a_PR: 'a PR', PR_LONG: 'pull request', host_cli: 'gh', CI: 'checks' },
  gitlab: { PR: 'MR', a_PR: 'an MR', PR_LONG: 'merge request', host_cli: 'glab', CI: 'pipeline' },
}
const PACKS = ['core', 'qa', 'tour']
const MODES = ['committed', 'hidden']

// ---------------------------------------------------------------- config

export function validateConfig(c) {
  const errors = []
  if (!c || typeof c !== 'object') return ['config is not an object']
  if (!/^[a-z][a-z0-9-]*$/.test(c.prefix ?? '')) errors.push('prefix: lowercase letters, digits, dashes')
  if (!HOSTS[c.host]) errors.push(`host: one of ${Object.keys(HOSTS).join(', ')}`)
  if (!MODES.includes(c.mode)) errors.push(`mode: one of ${MODES.join(', ')}`)
  if (!Array.isArray(c.packs) || !c.packs.includes('core')) errors.push('packs: an array that includes "core"')
  for (const p of c.packs ?? []) if (!PACKS.includes(p)) errors.push(`packs: unknown pack "${p}"`)
  if ((c.packs ?? []).includes('tour') && !(c.packs ?? []).includes('qa')) errors.push('packs: "tour" needs "qa"')
  if (typeof c.base !== 'string' || !c.base) errors.push('base: the default base branch, e.g. "main"')
  if (c.shared != null && !/^\.claude\/[^/]+$/.test(c.shared)) errors.push('shared: a folder directly under .claude/')
  return errors
}

export function sharedDir(c) {
  return c.shared ?? `.claude/${c.prefix}-shared`
}

export function findConfig(root) {
  const dir = path.join(root, '.claude')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'shipkit.json')))
    .map((e) => path.join(dir, e.name, 'shipkit.json'))
}

export function variables(c) {
  const shared = sharedDir(c)
  return {
    prefix: c.prefix,
    shared,
    tmp: '.claude/.tmp',
    reports: 'reports',
    base: c.base,
    ...HOSTS[c.host],
  }
}

export function flags(c) {
  return new Set([c.host, c.mode, ...c.packs])
}

// ---------------------------------------------------------------- templating

// {{#if flag}} … {{else}} … {{/if}}, {{#unless flag}} … {{/unless}}; a tag alone on its line
// takes the whole line with it. Then {{name}} from the variables; an unknown name is an error.
const TAG = /^[ \t]*(\{\{(?:#(?:if|unless) [\w-]+|else|\/(?:if|unless))\}\})[ \t]*(?:\r?\n|$)|(\{\{(?:#(?:if|unless) [\w-]+|else|\/(?:if|unless))\}\})/gm

export function renderText(text, vars, flagSet, where = 'template') {
  let out = ''
  let last = 0
  const stack = []
  const active = () => stack.every((s) => s.on)
  for (const m of text.matchAll(TAG)) {
    if (active()) out += text.slice(last, m.index)
    last = m.index + m[0].length
    const tag = m[1] ?? m[2]
    const open = /^\{\{#(if|unless) ([\w-]+)\}\}$/.exec(tag)
    if (open) {
      const want = open[1] === 'if'
      stack.push({ kind: open[1], on: flagSet.has(open[2]) === want, elsed: false })
    } else if (tag === '{{else}}') {
      const top = stack.at(-1)
      if (!top || top.elsed) throw new Error(`${where}: stray {{else}}`)
      top.on = !top.on
      top.elsed = true
    } else {
      const kind = tag.slice(3, -2)
      const top = stack.pop()
      if (!top || top.kind !== kind) throw new Error(`${where}: unbalanced ${tag}`)
    }
  }
  if (stack.length) throw new Error(`${where}: unclosed {{#${stack.at(-1).kind}}}`)
  if (active()) out += text.slice(last)
  return out.replace(/\{\{([A-Za-z_]+)\}\}/g, (all, name) => {
    if (!(name in vars)) throw new Error(`${where}: unknown placeholder ${all}`)
    return vars[name]
  })
}

export function loadManifest(kit) {
  return JSON.parse(fs.readFileSync(path.join(kit, 'manifest.json'), 'utf8'))
}

export function renderAll(c, kit) {
  const manifest = loadManifest(kit)
  const vars = variables(c)
  const fl = flags(c)
  const files = []
  for (const t of manifest.templates) {
    if (!c.packs.includes(t.pack)) continue
    if (t.when && !fl.has(t.when)) continue
    const src = path.join(kit, 'templates', t.src)
    const raw = fs.readFileSync(src, 'utf8')
    const dest = renderText(t.dest, vars, fl, `${t.src} (dest)`)
    const content = t.raw ? raw : renderText(raw, vars, fl, t.src)
    files.push({ src: t.src, dest, content, mode: t.mode ?? null, pack: t.pack })
  }
  return { version: manifest.version, files }
}

// ---------------------------------------------------------------- state on disk

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

function readOrNull(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function writeFile(p, content, mode) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
  if (mode) fs.chmodSync(p, parseInt(mode, 8))
}

export function gitCommonDir(root) {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    return path.resolve(root, out.toString().trim())
  } catch {
    return null
  }
}

export function stateDir(root, c) {
  const git = gitCommonDir(root)
  return git ? path.join(git, 'shipkit', c.prefix) : path.join(root, '.claude', '.tmp', 'shipkit', c.prefix)
}

function merge3(ours, base, theirs, scratch) {
  fs.mkdirSync(scratch, { recursive: true })
  const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => path.join(scratch, n))
  fs.writeFileSync(o, ours)
  fs.writeFileSync(b, base)
  fs.writeFileSync(t, theirs)
  try {
    const out = execFileSync('git', ['merge-file', '-p', '-L', 'yours', '-L', 'previous template', '-L', 'new template', o, b, t], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { clean: true, text: out.toString() }
  } catch (e) {
    if (typeof e.status === 'number' && e.status > 0 && e.stdout) return { clean: false, text: e.stdout.toString() }
    throw e
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- plan

// Statuses:
//   new        not on disk yet                       → written by apply
//   same       on disk, equal to the new render      → nothing to do
//   update     unedited since the last apply         → overwritten by apply
//   kept       edited by hand, template unchanged    → left as is
//   merged     edited by hand, template changed, clean 3-way merge → merged result written by apply
//   conflict   edited by hand, template changed, merge conflicts (or no base) → decide: --take / --keep after resolving
//   adopt      on disk before shipkit managed it     → decide: --take / --keep
//   removed    managed, deleted by hand              → decide: --take (restore) / --skip
//   skipped    listed in config.skip                 → never written
//   orphan     managed earlier, no template now      → decide: --remove / --keep
//   unmanaged  .claude/commands/<prefix>:*.md shipkit doesn't know → decide: --remove / --keep
export function plan(root, c, kit) {
  const { version, files } = renderAll(c, kit)
  const lock = c.files ?? {}
  const skip = new Set(c.skip ?? [])
  const keep = new Set(c.keep ?? [])
  const state = stateDir(root, c)
  const rows = []
  const rendered = new Set()
  for (const f of files) {
    rendered.add(f.dest)
    const abs = path.join(root, f.dest)
    const cur = readOrNull(abs)
    const locked = lock[f.dest]?.sha
    const basePath = path.join(state, 'base', f.dest)
    const nextPath = path.join(state, 'next', f.dest)
    const row = { dest: f.dest, src: f.src, pack: f.pack, next: nextPath }
    writeFile(nextPath, f.content)
    if (skip.has(f.dest)) row.status = 'skipped'
    else if (cur === null) row.status = locked ? 'removed' : 'new'
    else if (cur === f.content) row.status = 'same'
    else if (!locked) row.status = 'adopt'
    else if (sha(cur) === locked) row.status = 'update'
    else if (locked === sha(f.content)) row.status = 'kept'
    else {
      const base = readOrNull(basePath)
      if (base === null) row.status = 'conflict'
      else {
        const m = merge3(cur, base, f.content, path.join(state, 'scratch'))
        const mergePath = path.join(state, 'merge', f.dest)
        writeFile(mergePath, m.text)
        row.status = m.clean ? 'merged' : 'conflict'
        row.merge = mergePath
      }
    }
    if (fs.existsSync(basePath)) row.base = basePath
    rows.push(row)
  }
  for (const dest of Object.keys(lock)) {
    if (rendered.has(dest)) continue
    rows.push({ dest, status: fs.existsSync(path.join(root, dest)) ? 'orphan' : 'gone' })
  }
  const cmdDir = path.join(root, '.claude', 'commands')
  if (fs.existsSync(cmdDir)) {
    for (const name of fs.readdirSync(cmdDir).sort()) {
      const dest = `.claude/commands/${name}`
      if (!name.startsWith(`${c.prefix}:`) || rendered.has(dest) || lock[dest] || keep.has(dest)) continue
      rows.push({ dest, status: 'unmanaged' })
    }
  }
  const summary = {}
  for (const r of rows) summary[r.status] = (summary[r.status] ?? 0) + 1
  return { version, prefix: c.prefix, shared: sharedDir(c), state, summary, files: rows, rendered: files }
}

// ---------------------------------------------------------------- apply

const BLOCK_BEGIN = (p) => `# >>> shipkit:${p}`
const BLOCK_END = (p) => `# <<< shipkit:${p}`

// Our block in an ignore file: replaced in place (with the blank line before it), never duplicated,
// and only ours: `shipkit:p` never touches the block of a toolkit named `pq`.
export function setBlock(file, prefix, lines, note) {
  const old = readOrNull(file)
  const begin = BLOCK_BEGIN(prefix)
  const end = BLOCK_END(prefix)
  const rows = old === null || old === '' ? [] : old.split('\n')
  if (rows.at(-1) === '') rows.pop()
  for (;;) {
    const b = rows.findIndex((r) => r === begin || r.startsWith(`${begin} `))
    if (b < 0) break
    let e = rows.findIndex((r, i) => i > b && r === end)
    if (e < 0) e = b
    const start = b > 0 && rows[b - 1] === '' ? b - 1 : b
    rows.splice(start, e - start + 1)
  }
  if (lines && lines.length) {
    while (rows.length && rows.at(-1) === '') rows.pop()
    if (rows.length) rows.push('')
    rows.push(`${begin} ${note}`, ...lines, end)
  }
  const text = rows.length ? `${rows.join('\n')}\n` : ''
  if (text === (old ?? '')) return false
  writeFile(file, text)
  return true
}

export function ignoreLines(c) {
  const scratch = c.scratch ?? DEFAULT_SCRATCH
  if (c.mode === 'hidden') return [`.claude/commands/${c.prefix}:*.md`, `${sharedDir(c)}/`, ...scratch]
  return scratch
}

export function apply(root, c, kit, opts = {}) {
  const set = (k) => new Set(opts[k] ?? [])
  const take = set('take')
  const keepNow = set('keep')
  const remove = set('remove')
  const skipNow = set('skip')
  const unskip = set('unskip')
  const cfg = { ...c, skip: [...new Set([...(c.skip ?? []), ...skipNow])].filter((d) => !unskip.has(d)) }
  const p = plan(root, cfg, kit)
  const lock = { ...(c.files ?? {}) }
  const keepList = new Set(c.keep ?? [])
  const done = []
  const pending = []
  const byDest = new Map(p.rendered.map((f) => [f.dest, f]))
  const record = (f) => {
    lock[f.dest] = { src: f.src, sha: sha(f.content) }
    writeFile(path.join(p.state, 'base', f.dest), f.content)
  }
  const write = (f, content = f.content) => writeFile(path.join(root, f.dest), content, f.mode)
  for (const r of p.files) {
    const f = byDest.get(r.dest)
    const act = (what) => done.push({ dest: r.dest, did: what })
    if (r.status === 'skipped') {
      delete lock[r.dest]
      continue
    }
    if (f && take.has(r.dest)) {
      write(f)
      record(f)
      act('took template')
      continue
    }
    switch (r.status) {
      case 'new':
      case 'update':
        write(f)
        record(f)
        act(r.status === 'new' ? 'created' : 'updated')
        break
      case 'same':
      case 'kept':
        if (f.mode) fs.chmodSync(path.join(root, f.dest), parseInt(f.mode, 8))
        record(f)
        break
      case 'merged':
        write(f, readOrNull(r.merge))
        record(f)
        act('merged your edits with the new template')
        break
      case 'conflict':
      case 'adopt':
        if (keepNow.has(r.dest)) {
          record(f)
          act('kept yours')
        } else pending.push(r)
        break
      case 'removed':
        pending.push(r)
        break
      case 'orphan':
      case 'unmanaged':
        if (remove.has(r.dest)) {
          fs.rmSync(path.join(root, r.dest), { force: true })
          delete lock[r.dest]
          act('removed')
        } else if (keepNow.has(r.dest)) {
          delete lock[r.dest]
          keepList.add(r.dest)
          act('kept as your own file')
        } else pending.push(r)
        break
      case 'gone':
        delete lock[r.dest]
        break
    }
  }
  const out = { ...cfg, shipkit: p.version, keep: [...keepList].sort(), files: sortKeys(lock) }
  if (!out.skip.length) delete out.skip
  if (!out.keep.length) delete out.keep
  const cfgPath = path.join(root, sharedDir(c), 'shipkit.json')
  writeFile(cfgPath, JSON.stringify(orderConfig(out), null, 2) + '\n')

  const git = gitCommonDir(root)
  const note = `(managed by /shipkit:forge: ${c.mode === 'hidden' ? 'the toolkit and its' : 'the'} scratch output of the /${c.prefix}:* commands)`
  const ignore = {}
  ignore.gitignore = setBlock(path.join(root, '.gitignore'), c.prefix, c.mode === 'committed' ? ignoreLines(c) : null, note)
  if (git) ignore.exclude = setBlock(path.join(git, 'info', 'exclude'), c.prefix, c.mode === 'hidden' ? ignoreLines(c) : null, note)
  let tracked = []
  if (c.mode === 'hidden' && git) {
    try {
      tracked = execFileSync('git', ['ls-files', '--', `.claude/commands/${c.prefix}:*.md`, sharedDir(c)], { cwd: root })
        .toString()
        .split('\n')
        .filter(Boolean)
    } catch {}
  }
  return { version: p.version, config: path.relative(root, cfgPath), done, pending, ignore, trackedButHidden: tracked }
}

function sortKeys(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
}

const ORDER = ['shipkit', 'prefix', 'shared', 'base', 'host', 'packs', 'mode', 'profile', 'scratch', 'keep', 'skip', 'files']
function orderConfig(o) {
  const out = {}
  for (const k of ORDER) if (k in o && o[k] !== undefined) out[k] = o[k]
  for (const k of Object.keys(o)) if (!(k in out) && o[k] !== undefined) out[k] = o[k]
  return out
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      if (['take', 'keep', 'remove', 'skip', 'unskip'].includes(k)) (opts[k] ??= []).push(v)
      else opts[k] = v
    } else opts._.push(a)
  }
  return opts
}

function loadConfig(root, given) {
  let file = given && path.resolve(root, given)
  if (!file) {
    const found = findConfig(root)
    if (found.length !== 1) {
      throw new Error(found.length ? `several shipkit.json found, pass --config: ${found.join(', ')}` : 'no .claude/*/shipkit.json: run /shipkit:forge first')
    }
    file = found[0]
  }
  const c = JSON.parse(fs.readFileSync(file, 'utf8'))
  const errors = validateConfig(c)
  if (errors.length) throw new Error(`${path.relative(root, file)}: ${errors.join('; ')}`)
  return c
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const opts = parseArgs(rest)
  const root = path.resolve(opts._[0] && cmd !== 'render' ? opts._[0] : opts.root ?? '.')
  const kit = path.resolve(opts.kit ?? HERE)
  const c = loadConfig(root, opts.config)
  if (cmd === 'plan') {
    const { rendered, ...p } = plan(root, c, kit)
    console.log(JSON.stringify(p, null, 2))
  } else if (cmd === 'apply') {
    console.log(JSON.stringify(apply(root, c, kit, opts), null, 2))
  } else if (cmd === 'render') {
    const src = opts._.at(-1)
    const f = renderAll(c, kit).files.find((x) => x.src === src)
    if (!f) throw new Error(`no template ${src} in this project's packs`)
    process.stdout.write(f.content)
  } else {
    console.error('usage: render.mjs plan|apply [root] [--config f] [--kit dir] | render --root dir <src>')
    process.exit(2)
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (e) {
    console.error(`shipkit: ${e.message}`)
    process.exit(1)
  }
}
