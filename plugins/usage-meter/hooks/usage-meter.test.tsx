import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-11-15T12:00:00Z')

const SNAPSHOT = {
  shape: 'snapshot-1',
  value: {
    limits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-11-15T14:13:00Z' },
      { kind: 'seven_day', percentUsed: 88, resetsAt: '2026-11-19T14:00:00Z' },
    ],
    contextPercent: 34,
    costUsd: 1.5,
  },
}

const BAND = {
  plugin: 'usage-meter',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'usage-meter',
  component: 'Pane',
  requestId: 'usage-meter',
  props: {
    title: 'Usage',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 24 },
    view: {},
  },
} as const

test('the band shows both windows with their resets', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('state.get', () => ({ value: { value: SNAPSHOT, version: 1 } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /Session/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Weekly/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toContain('42%')
    expect((await ui.find({ type: 'Text', text: /88%/ }))?.text).toContain('88%')
    expect((await ui.find({ type: 'Text', text: /2h 13m/ }))?.text).toContain('2h 13m')
    expect((await ui.find({ type: 'Text', text: /4d 2h/ }))?.text).toContain('4d 2h')
    await ui.unmount()
  }
})

test('the band stays quiet and honest before any reading', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /after the first reply/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('a narrow band stacks the windows', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('state.get', () => ({ value: { value: SNAPSHOT, version: 1 } }))

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, bodyColumns: 60 },
    surface: 'terminal',
  })

  expect((await ui.find({ type: 'Text', text: /Weekly/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('the pane forecasts a limit the pace will hit', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('state.get', () => ({ value: { value: SNAPSHOT, version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // 88% used with ~4 of 7 days left: the weekly limit is on course to run out.
  expect((await ui.find({ type: 'Text', text: /hit the limit/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /\$1\.50/ }))?.text).toBeDefined()
  await ui.unmount()
})
