import { expect, mock, test } from 'claude-code/testing'

const SPINNER = {
  plugin: 'working-critter',
  component: 'Spinner',
  requestId: 'main',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
} as const

test('the terminal keeps the engine label and hangs the critter beside it', async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []

  // What the engine draws for the spinner on its own.
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

  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
  expect(await ui.find({ key: 'critter' })).toBeDefined()

  await clock.advance(300)

  expect(blits.length).toBeGreaterThan(3)
  expect(new Set(blits)).toEqual(new Set(['critter']))
  await ui.unmount()
})

test('the other surfaces keep the engine label alone', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>Sauteing…</Text>
  })

  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...SPINNER, surface })

    expect(await ui.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
    expect(await ui.find({ key: 'critter' })).toBeUndefined()
    await ui.unmount()
  }
})
