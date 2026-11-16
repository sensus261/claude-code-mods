import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const PANE = 'usage-meter'
const HOUR = 3_600_000
const DAY = 24 * HOUR

// Bump the tag when Snapshot's fields change: a reload declines what an
// earlier version stored.
const snapshot = atom(
  { plugin: 'usage-meter', key: 'snapshot' } as const,
  { limits: [], contextPercent: null, costUsd: null },
  { shape: 'snapshot-1' },
)

const WINDOWS: Record<string, { label: string; ms: number }> = {
  five_hour: { label: 'Session', ms: 5 * HOUR },
  seven_day: { label: 'Weekly', ms: 7 * DAY },
}
const ORDER = ['five_hour', 'seven_day']

const labelOf = (kind: string) =>
  WINDOWS[kind]?.label ?? kind.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

const clamp = (n: number) => Math.max(0, Math.min(100, n))

// Green while there is room, amber as it fills, red close to the wall.
const toneOf = (percent: number) =>
  percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'

const sorted = (limits: Limit[]) =>
  [...limits].sort((a, b) => {
    const ia = ORDER.indexOf(a.kind)
    const ib = ORDER.indexOf(b.kind)

    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

// "2h 13m", "4d 2h", "9m", "now".
const span = (ms: number) => {
  if (ms <= 0) return 'now'

  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`

  return `${mins}m`
}

const msUntil = (limit: Limit, now: number) =>
  limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt) - now

const clockTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString([], {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type Run = { text: string; color?: string; isDim?: boolean }

// A bar in half-block steps. `pace` (0-100) drops a marker where an even burn
// of the window would be by now.
const cellsOf = (percent: number, width: number, pace?: number): Run[] => {
  const halves = Math.round((clamp(percent) / 100) * width * 2)
  const color = toneOf(percent)
  const cells: Run[] = []

  for (let i = 0; i < width; i++) {
    if (halves >= (i + 1) * 2) cells.push({ text: '█', color })
    else if (halves === i * 2 + 1) cells.push({ text: '▌', color })
    else cells.push({ text: '░', isDim: true })
  }

  if (pace !== undefined) {
    const at = Math.min(width - 1, Math.floor((clamp(pace) / 100) * width))
    cells[at] = { text: '│', color: 'text' }
  }

  const runs: Run[] = []
  for (const cell of cells) {
    const last = runs[runs.length - 1]
    if (last && last.color === cell.color && last.isDim === cell.isDim) {
      last.text += cell.text
    } else {
      runs.push({ ...cell })
    }
  }

  return runs
}

const fromUsage = (u: {
  rateLimits: readonly Limit[]
  context: { percent?: number }
  cost?: { usd: number }
}): Snapshot => ({
  limits: sorted(
    u.rateLimits.map(l => ({
      kind: l.kind,
      percentUsed: l.percentUsed,
      resetsAt: l.resetsAt,
    })),
  ),
  contextPercent: u.context.percent ?? null,
  costUsd: u.cost?.usd ?? null,
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'limits',
      description: 'Open the usage pane: session and weekly limits, pace, resets',
    })

    const usage = await $.session.usage()
    await update($, snapshot, () => fromUsage(usage))

    // The countdowns tick on the clock, not on a measurement.
    $.clock.every(30_000, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, () => fromUsage(e))

    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Usage' })
    const snap = await read($, snapshot)
    const now = await $.clock.now()

    if (snap.limits.length === 0) {
      return { text: 'No plan limits reported yet. They show up after the first reply.' }
    }

    const lines = snap.limits.map(l => {
      const ms = msUntil(l, now)
      const reset = ms === undefined ? '' : `, resets in ${span(ms)}`

      return `${labelOf(l.kind)}: ${Math.round(l.percentUsed)}% used${reset}`
    })

    return { text: lines.join('\n') }
  })

  // The band: one quiet row above the prompt, always in view.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    const width = e.props.bodyColumns
    const isWide = width >= 96
    const barWidth = isWide ? 12 : Math.max(6, Math.min(16, width - 34))

    const open = (
      <Button key="details" plain onPress={() => $.ui.open({ id: PANE, title: 'Usage' })}>
        <Text dimColor>details</Text>
      </Button>
    )

    if (snap.limits.length === 0) {
      return (
        <Box gap={1} marginTop={1}>
          <Text color="claude">◆</Text>
          <Text dimColor>
            Usage
            {snap.costUsd === null
              ? ' · limits show up after the first reply'
              : ` · $${snap.costUsd.toFixed(2)} this session · no plan limits reported`}
          </Text>
        </Box>
      )
    }

    const segments = snap.limits.map(l => {
      const ms = msUntil(l, now)

      return (
        <Box key={l.kind} gap={1}>
          <Text weight="bold">{labelOf(l.kind).padEnd(7)}</Text>
          <Text>
            {cellsOf(l.percentUsed, barWidth).map(run => (
              <Text color={run.color} dimColor={run.isDim}>
                {run.text}
              </Text>
            ))}
          </Text>
          <Text color={toneOf(l.percentUsed)} weight="bold">
            {`${Math.round(l.percentUsed)}%`.padStart(4)}
          </Text>
          {ms !== undefined && <Text dimColor>{`↻ ${span(ms)}`}</Text>}
        </Box>
      )
    })

    const context =
      snap.contextPercent === null ? null : (
        <Text dimColor>{`ctx ${Math.round(snap.contextPercent)}%`}</Text>
      )

    if (isWide) {
      return (
        <Box gap={3} marginTop={1}>
          <Text color="claude">◆</Text>
          {segments}
          {context}
          {open}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        {segments}
        <Box gap={2}>
          {context}
          {open}
        </Box>
      </Box>
    )
  })

  // The pane: the same numbers with room to breathe, plus pace and a forecast.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    const width = Math.max(12, Math.min(44, e.props.bodyColumns - 2))

    const bar = (percent: number, pace?: number) => (
      <Text>
        {cellsOf(percent, width, pace).map(run => (
          <Text color={run.color} dimColor={run.isDim}>
            {run.text}
          </Text>
        ))}
      </Text>
    )

    if (snap.limits.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text weight="bold">Usage</Text>
          <Text dimColor>
            No plan limits reported yet. They appear after the first reply, and only on a
            Claude subscription.
          </Text>
          {snap.costUsd !== null && <Text>{`Session cost  $${snap.costUsd.toFixed(2)}`}</Text>}
        </Box>
      )
    }

    const cards = snap.limits.map(l => {
      const window = WINDOWS[l.kind]
      const ms = msUntil(l, now)
      const elapsedMs = window && ms !== undefined ? window.ms - ms : undefined
      const pace =
        window && elapsedMs !== undefined ? clamp((elapsedMs / window.ms) * 100) : undefined

      let paceLine: { text: string; color: string } | undefined
      if (pace !== undefined && elapsedMs !== undefined && window && ms !== undefined) {
        const delta = Math.round(l.percentUsed - pace)
        const canForecast = elapsedMs >= window.ms * 0.05 && l.percentUsed >= 1
        const toFull = canForecast
          ? ((100 - l.percentUsed) / l.percentUsed) * elapsedMs
          : undefined

        if (toFull !== undefined && toFull < ms) {
          paceLine = { text: `▲ at this pace you hit the limit in ~${span(toFull)}`, color: 'error' }
        } else if (delta > 5) {
          paceLine = { text: `▲ ${delta} pts ahead of an even pace`, color: 'warning' }
        } else if (delta < -5) {
          paceLine = { text: `▼ ${-delta} pts under an even pace`, color: 'success' }
        } else {
          paceLine = { text: '● right on an even pace', color: 'success' }
        }
      }

      return (
        <Box key={l.kind} flexDirection="column">
          <Box justifyContent="space-between">
            <Text weight="bold">{labelOf(l.kind)}</Text>
            <Text color={toneOf(l.percentUsed)} weight="bold">
              {`${Math.round(l.percentUsed)}%`}
            </Text>
          </Box>
          {bar(l.percentUsed, pace)}
          {ms !== undefined && l.resetsAt !== undefined && (
            <Text dimColor>{`resets in ${span(ms)} · ${clockTime(l.resetsAt)}`}</Text>
          )}
          {paceLine !== undefined && <Text color={paceLine.color}>{paceLine.text}</Text>}
        </Box>
      )
    })

    return (
      <Box flexDirection="column" gap={1}>
        {cards}
        {snap.contextPercent !== null && (
          <Box flexDirection="column">
            <Box justifyContent="space-between">
              <Text weight="bold">Context</Text>
              <Text>{`${Math.round(snap.contextPercent)}%`}</Text>
            </Box>
            {bar(snap.contextPercent)}
          </Box>
        )}
        {snap.costUsd !== null && (
          <Text dimColor>{`This session cost $${snap.costUsd.toFixed(2)}`}</Text>
        )}
        <Text dimColor>│ marks where an even burn of the window would be by now.</Text>
      </Box>
    )
  })
}
