import type { AgentInfo, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'working-critter'

const SPINNER = {
  plugin: PLUGIN,
  component: 'Spinner',
  requestId: 'main',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
} as const

const BAND = {
  plugin: PLUGIN,
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
// A tick's worth of milliseconds, rounded up.
const TICK = 70
// Long enough for a finished shell's flash and any leaver's puff.
const GONE = 20 * TICK

// What the engine does beneath the mod: draws its own rows, takes blits,
// lists the agents given (only the fields the mod reads), and starts and ends
// turns.
const engine = (on: On, agents: { id: string; status: string }[] = []) => {
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
  on('agent.list', () => ({ value: agents as unknown as AgentInfo[] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  return { clock, blits }
}

// A tool call's row in the transcript: drawn while it runs, then again with
// its result.
const runTool = async ($: Engine, rowId: string, tool: string, input: unknown, output: unknown) => {
  const flags = { tool_use_id: rowId, isErrored: false, isInterrupted: false }
  const row = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'ToolUse',
    requestId: rowId,
    props: { tool, input, isRunning: true, ...flags },
  })

  await row.redraw({ tool, input, isRunning: false, ...flags, output })
  await row.unmount()
}

// A background task's notification row.
const notify = async ($: Engine, rowId: string, id: string, status?: string) => {
  const row = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'UserMessage',
    requestId: rowId,
    props: {
      text: 'notification',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: status === undefined ? { id } : { id, status },
    },
  })

  await row.unmount()
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

test('a subagent waiting on its own background work stays until the list says it ended', async ($, on) => {
  const agents = [{ id: 'agent-3', status: 'running' }]
  const { clock } = engine(on, agents)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const columns = async () => (await ui.find({ key: 'critter' }))?.props.columns
  const alone = Number(await columns())

  await $.turn.start({ text: 'sleep in the background', turnId: 't3', agentId: 'agent-3' })
  await clock.advance(3 * TICK)

  // Its turn ends and a "completed" notification comes, but it only waits.
  agents[0] = { id: 'agent-3', status: 'waiting' }
  await $.turn.complete({
    answer: '',
    durationMs: 10,
    isAborted: false,
    turnId: 't3',
    agentId: 'agent-3',
    reason: 'answer',
  })
  await notify($, 'row-3', 'agent-3', 'completed')
  await clock.advance(GONE)

  expect(await columns()).toBe(alone + SLOT)

  // The list's next check finds it ended.
  agents[0] = { id: 'agent-3', status: 'completed' }
  await clock.advance(45 * TICK)

  expect(await columns()).toBe(alone)
  await ui.unmount()
})

test('a background shell joins the crew until its notification says it ended', async ($, on) => {
  const { clock } = engine(on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const columns = async () => (await ui.find({ key: 'critter' }))?.props.columns
  const alone = await columns()

  // A command that finished in the foreground brings nobody.
  await runTool($, 'tu-0', 'Bash', { command: 'ls' }, { stdout: '', stderr: '', interrupted: false })
  await runTool(
    $,
    'tu-1',
    'Bash',
    { command: 'npm run dev', run_in_background: true },
    { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'shell-1' },
  )
  await clock.advance(3 * TICK)

  expect(await columns()).toBe(Number(alone) + SLOT)

  await notify($, 'row-1', 'shell-1', 'completed')
  await clock.advance(GONE)

  expect(await columns()).toBe(alone)
  await ui.unmount()
})

test('an old row of a resumed transcript brings nobody', async ($, on) => {
  const { clock } = engine(on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const alone = (await ui.find({ key: 'critter' }))?.props.columns

  // Drawn once, already resolved: the call was never watched running.
  const row = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'tu-old',
    props: {
      tool_use_id: 'tu-old',
      tool: 'Bash',
      input: { command: 'npm run dev', run_in_background: true },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'shell-old' },
    },
  })

  await row.unmount()
  await clock.advance(3 * TICK)

  expect((await ui.find({ key: 'critter' }))?.props.columns).toBe(alone)
  await ui.unmount()
})

test('between turns, a running monitor shows the crew above the prompt', async ($, on) => {
  const { clock } = engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ key: 'crew' })).toBeUndefined()

  await runTool(
    $,
    'tu-2',
    'Monitor',
    { description: 'CI', timeout_ms: 300000, command: 'watch-ci' },
    { taskId: 'monitor-1', timeoutMs: 300000 },
  )
  await clock.advance(3 * TICK)

  expect(await ui.find({ key: 'crew' })).toBeDefined()

  // An event it saw is no ending.
  await notify($, 'row-2', 'monitor-1')
  await clock.advance(GONE)

  expect(await ui.find({ key: 'crew' })).toBeDefined()

  // Its ending lets it go, and the band empties.
  await notify($, 'row-4', 'monitor-1', 'completed')
  await clock.advance(GONE)

  expect(await ui.find({ key: 'crew' })).toBeUndefined()
  await ui.unmount()
})

test('while Claude works, the band leaves the crew to the working row', async ($, on) => {
  const { clock } = engine(on)

  await runTool(
    $,
    'tu-3',
    'Monitor',
    { description: 'CI', timeout_ms: 300000, command: 'watch-ci' },
    { taskId: 'monitor-2', timeoutMs: 300000 },
  )
  await clock.advance(3 * TICK)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })

  expect(await ui.find({ key: 'crew' })).toBeUndefined()
  await ui.unmount()

  await runTool(
    $,
    'tu-4',
    'TaskStop',
    { task_id: 'monitor-2' },
    { message: 'stopped', task_id: 'monitor-2', task_type: 'monitor' },
  )
  await clock.advance(GONE)
})
