import type { EngineInterface, Register } from 'claude-code'

// ---------------------------------------------------------------------------
// working-critter: a tiny pixel critter trots at the right edge of the row
// that carries Claude's own "working" label. It is absolutely positioned, so
// it takes no room: it hangs over the empty end of the row. Terminal only
// (a Raster of half blocks, two pixels per cell, repainted with $.ui.blit).
// ---------------------------------------------------------------------------

const W = 10 // pixels (= terminal columns)
const ROWS = 2 // terminal rows
const H = ROWS * 2 // pixel rows
const TICK_MS = 66 // ~15 fps
const NONE = -1
const DEFAULT = 0x01000000 // the terminal's own color
const X0 = 3 // the critter's left edge
const GRACE_TICKS = 8 // blits denied in a row before a spinner is forgotten
const IDLE_TICKS = 20 // ticks with no spinner mounted before the timer stops

const C = {
  body: 0xd97757,
  light: 0xf0a283,
  shade: 0xb35a3d,
  eye: 0x2a1a15,
  trail: [0xd97757, 0x9a5640, 0x5e3c30],
} as const

// The critter, 7 x 3. b body, l light, e eye. Arms and legs are drawn apart.
const BODY = ['.lbbbb.', '.bebeb.', '.bbbbb.']
const SPRITE_W = 7

// Speed lines flying past, behind the critter: row, length, speed, offset.
const STREAKS = [
  { y: 1, len: 3, speed: 2, off: 0 },
  { y: 2, len: 2, speed: 3, off: 2 },
] as const

// ---------------------------------------------------------------- pixels ---

type Canvas = Int32Array

const plot = (px: Canvas, x: number, y: number, color: number) => {
  const cx = Math.round(x)
  const cy = Math.round(y)

  if (cx < 0 || cy < 0 || cx >= W || cy >= H) {
    return
  }

  px[cy * W + cx] = color
}

const runScene = (t: number): Canvas => {
  const px: Canvas = new Int32Array(W * H).fill(NONE)

  // Speed lines: bright at the leading (left) edge, fading toward the critter.
  for (const s of STREAKS) {
    const head = X0 - 1 - ((t * s.speed + s.off) % (X0 + 3))

    for (let k = 0; k < s.len; k += 1) {
      const fade = Math.min(2, Math.floor((k / s.len) * 3))
      plot(px, head + k, s.y, C.trail[fade] ?? C.trail[2])
    }
  }

  const phase = Math.floor(t / 3) % 4
  const isBlink = t % 50 >= 47

  BODY.forEach((row, ry) => {
    for (let rx = 0; rx < SPRITE_W; rx += 1) {
      const ch = row[rx]

      if (ch === undefined || ch === '.') {
        continue
      }

      const color =
        ch === 'l' ? C.light : ch === 'e' ? (isBlink ? C.body : C.eye) : C.body

      plot(px, X0 + rx, ry, color)
    }
  })

  // Arms swing against each other.
  plot(px, X0, phase < 2 ? 1 : 2, C.shade)
  plot(px, X0 + SPRITE_W - 1, phase < 2 ? 2 : 1, C.shade)

  // Legs trot: left, both, right, both.
  if (phase !== 2) {
    plot(px, X0 + 2, 3, C.shade)
  }

  if (phase !== 0) {
    plot(px, X0 + 4, 3, C.shade)
  }

  return px
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const toBase64 = (bytes: Uint8Array): string => {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)

    out += BASE64[(n >> 18) & 63]
    out += BASE64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? BASE64[n & 63] : '='
  }

  return out
}

// Pack two pixel rows into one cell row: half blocks, transparent = the
// terminal's own background.
const toCells = (px: Canvas): string => {
  const bytes = new Uint8Array(W * ROWS * 12)
  let at = 0

  const put = (value: number) => {
    bytes[at] = value & 255
    bytes[at + 1] = (value >>> 8) & 255
    bytes[at + 2] = (value >>> 16) & 255
    bytes[at + 3] = (value >>> 24) & 255
    at += 4
  }

  for (let cy = 0; cy < ROWS; cy += 1) {
    for (let cx = 0; cx < W; cx += 1) {
      const top = px[cy * 2 * W + cx] ?? NONE
      const bottom = px[(cy * 2 + 1) * W + cx] ?? NONE

      if (top === NONE && bottom === NONE) {
        put(0x20)
        put(DEFAULT)
        put(DEFAULT)
      } else if (bottom === NONE) {
        put(0x2580)
        put(top)
        put(DEFAULT)
      } else if (top === NONE) {
        put(0x2584)
        put(bottom)
        put(DEFAULT)
      } else if (top === bottom) {
        put(0x2588)
        put(top)
        put(DEFAULT)
      } else {
        put(0x2580)
        put(top)
        put(bottom)
      }
    }
  }

  return toBase64(bytes)
}

// ---------------------------------------------------------------- corner ---

// The engine has no overlay slot at the top of the screen, so the critter is
// drawn from the working row with a negative `top`: the row's distance from
// the top, which is the terminal's height less the rows under it (the prompt
// box, its hint line and the footer). Tune this one number if the critter sits
// a row too low (lower it) or loses its top half off the screen (raise it).
const ROWS_BELOW_SPINNER = 6
const MIN_ROWS_FOR_CORNER = 14

// Fullscreen only: the inline layout has no fixed top to pin to, so there the
// critter hangs one row up from the working label instead.
const cornerOffset = (viewport?: { rows?: number; isFullscreen?: boolean }): number => {
  const rows = viewport?.rows

  if (viewport?.isFullscreen !== true || rows === undefined || rows < MIN_ROWS_FOR_CORNER) {
    return -1
  }

  return -(rows - 1 - ROWS_BELOW_SPINNER)
}

// ----------------------------------------------------------------- state ---

// Animation state lives at module level on purpose: a blit never goes through
// $.state, and a reload starting it over costs one frame.
const s = {
  timer: null as { cancel: () => void } | null,
  isBusy: false,
  // Mounted spinners by render id, with how many blits in a row were denied.
  mounted: new Map<string, number>(),
  frame: 0,
  idle: 0,
}

const stop = () => {
  s.timer?.cancel()
  s.timer = null
  s.idle = 0
}

const step = async ($: EngineInterface) => {
  if (s.isBusy) {
    return
  }

  s.isBusy = true

  try {
    s.frame += 1

    if (s.mounted.size === 0) {
      s.idle += 1

      if (s.idle > IDLE_TICKS) {
        stop()
      }

      return
    }

    s.idle = 0

    const cells = toCells(runScene(s.frame))

    for (const [id, denied] of [...s.mounted]) {
      const result = await $.ui.blit({ requestId: id, key: 'critter', cells })

      if (result.deny === undefined) {
        s.mounted.set(id, 0)
      } else if (denied + 1 >= GRACE_TICKS) {
        s.mounted.delete(id)
      } else {
        s.mounted.set(id, denied + 1)
      }
    }
  } catch {
    // Not mounted for a moment (a resize): next tick.
  } finally {
    s.isBusy = false
  }
}

const start = ($: EngineInterface) => {
  if (s.timer !== null) {
    return
  }

  try {
    s.timer = $.clock.every(TICK_MS, () => {
      void step($)
    })
  } catch {
    // No timer here: the critter stands still instead.
  }
}

// ------------------------------------------------------------------- mod ---

export const register: Register = on => {
  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      start($)
    }

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      stop()
    }

    return next(e)
  })

  // The row that carries Claude's own "working" label: keep it whole, and
  // hang the critter over its empty right end.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    s.mounted.set(e.requestId, 0)
    start($)

    const label = await next(e)
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box>
        {label}
        <Box position="absolute" right={0} top={cornerOffset(e.viewport)}>
          <Raster key="critter" columns={W} rows={ROWS} cells={toCells(runScene(s.frame))} />
        </Box>
      </Box>
    )
  })
}
