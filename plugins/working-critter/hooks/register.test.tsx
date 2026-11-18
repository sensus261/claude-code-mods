import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SPINNER = {
  plugin: 'working-critter',
  component: 'Spinner',
  requestId: 'main',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
} as const

const BAND = {
  plugin: 'working-critter',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// One helper slot: a helper's five columns and the gap after it.
const SLOT = 6
// A ticks's worth of milliseconds, rounded up.
const TICK = 70
// Long enough for a finished shell's flash and any leaver's puff.
const GONE = 20 * TICK

const note = (id: string, status?: string): string =>
  [
    '<task-notification>',
    `<task-id>${id}</task-id>`,
    status === undefined ? '<summary>Monitor event</summary>' : `<status>${status}</status>`,
    '</task-notification>',
  ].join('\n')

// What the engine does beneath the mod: draws its own label, takes blits,
// lists no agents, and starts and ends turns.
const engine = (on: On) => {
  const clock = mock.clock(on)
  const blits: string[] = []

  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>Sauteing…</Text>
  })
  on('ui.blit', (_, e) => {
    if ('cells' in e) {
      blits.push(e.key)
    }

    return { value: {} }
  })
  on('agent.list', () => ({ value: [] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // No settings hooks: the classic events answer nothing of their own.
  on('classic.PostToolUse', () => ({}))
  on('classic.Stop', () => ({}))

  return { clock, blits }
}

test('the terminal keeps the engine label and hangs the critter beside it', async ($, on) => {
  const { clock, blits } = engine(on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
  expect(await ui.find({ key: 'critter' })).toBeDefined()

  await clock.advance(300)

  expect(blits.length).toBeGreaterThan(3)
  expect(new Set(blits)).toEqual(new Set(['critter']))
  await ui.unmount()
})

test('the other surfaces keep the engine label alone', async ($, on) => {
  engine(on)

  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...SPINNER, surface })

    expect(await ui.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
    expect(await ui.find({ key: 'critter' })).toBeUndefined()
    await ui.unmount()
  }
})

test('each running subagent joins the crew, and leaves when its turn ends', async ($, on) => {
  const { clock } = engine(on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const columns = async () => (await ui.find({ key: 'critter' }))?.props.columns
  const alone = await columns()

  expect(typeof alone).toBe('number')

  await $.turn.start({ text: 'look around', turnId: 't1', agentId: 'agent-1' })
  await $.turn.start({ text: 'look elsewhere', turnId: 't2', agentId: 'agent-2' })
  await clock.advance(3 * TICK)

  expect(await columns()).toBe(Number(alone) + 2 * SLOT)

  await $.turn.complete({
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    agentId: 'agent-1',
    reason: 'answer',
  })
  await clock.advance(GONE)

  expect(await columns()).toBe(Number(alone) + SLOT)

  await $.turn.complete({
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    turnId: 't2',
    agentId: 'agent-2',
    reason: 'answer',
  })
  await clock.advance(GONE)

  expect(await columns()).toBe(alone)
  await ui.unmount()
})

test('a background shell joins the crew until its notification says it ended', async ($, on) => {
  const { clock } = engine(on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const columns = async () => (await ui.find({ key: 'critter' }))?.props.columns
  const alone = await columns()

  // A command that finished in the foreground brings nobody.
  await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    tool_response: { stdout: '', stderr: '', interrupted: false },
    tool_use_id: 'tu-0',
  })
  await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: { command: 'npm run dev', run_in_background: true },
    tool_response: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'shell-1' },
    tool_use_id: 'tu-1',
  })
  await clock.advance(3 * TICK)

  expect(await columns()).toBe(Number(alone) + SLOT)

  await $.session.append({
    message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: note('shell-1', 'completed') }] },
    door: 'queue',
    origin: { kind: 'task-notification' },
    uuid: 'row-1',
  })
  await clock.advance(GONE)

  expect(await columns()).toBe(alone)
  await ui.unmount()
})

test('between turns, a running monitor shows the crew above the prompt', async ($, on) => {
  const { clock } = engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ key: 'crew' })).toBeUndefined()

  await $.classic.PostToolUse({
    tool_name: 'Monitor',
    tool_input: { description: 'CI', timeout_ms: 300000, command: 'watch-ci' },
    tool_response: { taskId: 'monitor-1', timeoutMs: 300000 },
    tool_use_id: 'tu-2',
  })
  await clock.advance(3 * TICK)

  expect(await ui.find({ key: 'crew' })).toBeDefined()

  // An event it saw is no ending.
  await $.session.append({
    message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: note('monitor-1') }] },
    door: 'queue',
    origin: { kind: 'task-notification' },
    uuid: 'row-2',
  })
  await clock.advance(GONE)

  expect(await ui.find({ key: 'crew' })).toBeDefined()

  // A Stop that lists no background work lets it go.
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(GONE)

  expect(await ui.find({ key: 'crew' })).toBeUndefined()
  await ui.unmount()
})

test('while Claude works, the band leaves the crew to the working row', async ($, on) => {
  const { clock } = engine(on)

  await $.classic.PostToolUse({
    tool_name: 'Monitor',
    tool_input: { description: 'CI', timeout_ms: 300000, command: 'watch-ci' },
    tool_response: { taskId: 'monitor-2', timeoutMs: 300000 },
    tool_use_id: 'tu-3',
  })
  await clock.advance(3 * TICK)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })

  expect(await ui.find({ key: 'crew' })).toBeUndefined()
  await ui.unmount()

  await $.classic.PostToolUse({
    tool_name: 'TaskStop',
    tool_input: { task_id: 'monitor-2' },
    tool_response: { message: 'stopped', task_id: 'monitor-2', task_type: 'monitor' },
    tool_use_id: 'tu-4',
  })
  await clock.advance(GONE)
})
