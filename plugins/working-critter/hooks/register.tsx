import type { EngineInterface, Register } from 'claude-code'

// ---------------------------------------------------------------------------
// working-critter: a tiny pixel crew trots at the right edge of the row that
// carries Claude's own "working" label. The main critter leads; every running
// subagent follows as a smaller critter, every background shell as a little
// terminal on legs, every monitor as a watchful eye-bot. While Claude rests
// but background work goes on, the crew shows in the band above the prompt,
// the main critter asleep beside it.
//
// The crew hangs absolutely positioned over the working row, so it takes no
// room there. Terminal only (Rasters of half blocks, two pixels per cell,
// repainted with $.ui.blit).
// ---------------------------------------------------------------------------

const ROWS = 3 // terminal rows
const H = ROWS * 2 // pixel rows
const GROUND = H - 1 // the pixel row the feet stand on
const TICK_MS = 66 // ~15 fps
const NONE = -1
const DEFAULT = 0x01000000 // the terminal's own color
const GRACE_TICKS = 8 // blits denied in a row before a drawing is forgotten
const IDLE_TICKS = 20 // ticks with nothing drawn before the timer stops
const SYNC_TICKS = 30 // ~2 s between checks of the agent list
const AGENT_GRACE_TICKS = 45 // an agent the list does not name yet stays this long
const ARRIVE_TICKS = 6 // a newcomer drops in from above
const LEAVE_TICKS = 12 // a leaver goes up in a puff
const FLASH_TICKS = 6 // a finished shell flashes its result before the puff
const ALERT_TICKS = 30 // a monitor's antenna flashes this long on an event
const MAX_HELPERS = 8

// Widths, in pixels (= terminal columns).
const LANE = 3 // speed lines run here, behind the crew
const LEAD_W = 7
const HELPER_W = 5
const GAP = 1
const MORE_W = 4 // the "..." standing in for helpers past the cap

const C = {
  body: 0xd97757,
  light: 0xf0a283,
  shade: 0xb35a3d,
  eye: 0x2a1a15,
  trail: [0xd97757, 0x9a5640, 0x5e3c30],
  dust: 0x8a7a70,
  puff: [0xe6e1dc, 0xb8b2ac, 0x7d7873],
  thought: 0xc9ced6,
  spark: [0xffd166, 0xf4a259, 0xfff3c4],
  bulb: 0xffe066,
  zz: [0x9fc2ee, 0x6f8fbf, 0x4a5f80],
  box: 0xc8a06e,
  more: [0x9a948e, 0x5e5a56],
} as const

const AGENT_HUES = [0x4fb8a8, 0x9b7fd9, 0x5c9ded, 0x7cc46a, 0xe0b84a, 0xe07fa8] as const

const SHELL = {
  frame: 0x8b9099,
  leg: 0x5c6068,
  screen: 0x1d2126,
  text: 0x4fc06a,
  dim: 0x2f6e3d,
  cursor: 0xc6f6c4,
  ok: 0x6ee07a,
  fail: 0xe5534b,
} as const

const MONITOR = {
  shell: 0x7f8cc4,
  leg: 0x58639a,
  white: 0xeef0f6,
  pupil: 0x1b1d2e,
  led: 0xe5534b,
  off: 0x58639a,
  alert: 0xffd166,
} as const

// ----------------------------------------------------------------- dice ---

// A small seeded generator (mulberry32): acts are picked with it.
let seed = 0x2f6b9d1

const rand = (): number => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1))

const chance = (p: number): boolean => rand() < p

const pick = <T,>(options: ReadonlyArray<readonly [T, number]>, fallback: T): T => {
  let total = 0

  for (const [, weight] of options) {
    total += weight
  }

  let roll = rand() * total

  for (const [value, weight] of options) {
    roll -= weight

    if (weight > 0 && roll < 0) {
      return value
    }
  }

  return fallback
}

const hash = (text: string): number => {
  let n = 2166136261

  for (let i = 0; i < text.length; i += 1) {
    n ^= text.charCodeAt(i)
    n = Math.imul(n, 16777619)
  }

  return n >>> 0
}

// Noise that is a pure function of the frame, so every drawing of one frame
// agrees: sparks, flickering output.
const noise = (frame: number, salt: number): number => hash(`${frame}:${salt}`) / 4294967296

const mix = (a: number, b: number, t: number): number => {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)

  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// ---------------------------------------------------------------- pixels ---

type Canvas = { px: Int32Array; w: number }

const canvas = (w: number): Canvas => ({ px: new Int32Array(w * H).fill(NONE), w })

const plot = (c: Canvas, x: number, y: number, color: number) => {
  const cx = Math.round(x)
  const cy = Math.round(y)

  if (cx < 0 || cy < 0 || cx >= c.w || cy >= H) {
    return
  }

  c.px[cy * c.w + cx] = color
}

// Rows of letters, `.` transparent, each letter's color from `colors`.
const sprite = (
  c: Canvas,
  rows: readonly string[],
  x: number,
  y: number,
  colors: Readonly<Record<string, number>>,
  isFlipped = false,
) => {
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      const ch = row[isFlipped ? row.length - 1 - rx : rx]
      const color = ch === undefined ? undefined : colors[ch]

      if (color !== undefined) {
        plot(c, x + rx, y + ry, color)
      }
    }
  })
}

// --------------------------------------------------------------- the crew ---

type Kind = 'agent' | 'shell' | 'monitor'
type Outcome = 'ok' | 'fail' | 'stop'
type HelperAct = 'walk' | 'hop' | 'cheer' | 'carry' | 'rest' | 'scan' | 'stare' | 'shuffle'
type LeadAct = 'run' | 'dash' | 'hop' | 'look' | 'turn' | 'wave' | 'sleep' | 'peek' | 'stretch'
type Mode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'
type Site = 'spinner' | 'band'

type Member = {
  id: string
  kind: Kind
  hue: number
  offset: number // desyncs its steps from the others'
  bornAt: number
  leftAt: number | undefined
  outcome: Outcome | undefined
  isWaiting: boolean
  alertAt: number
  act: HelperAct
  actAt: number
  actUntil: number
  blinkAt: number
}

type Slot = { id: string; x: number }

// What one drawing shows: the crew as it stood when the drawing was made, so
// its width matches every blit until the next drawing.
type Mount = {
  site: Site
  key: string
  slots: Slot[]
  more: number
  width: number
  denied: number
}

// Animation state lives at module level on purpose: a blit never goes through
// $.state, and a reload starting it over costs one frame (the crew comes back
// at the next agent-list check and the next Stop's background-task list).
const s = {
  timer: null as { cancel: () => void } | null,
  isBusy: false,
  isSyncing: false,
  isDirty: false,
  mounted: new Map<string, Mount>(),
  crew: new Map<string, Member>(),
  mode: 'requesting' as Mode,
  frame: 0,
  idle: 0,
}

const lead = {
  act: 'run' as LeadAct,
  actAt: 0,
  actUntil: 0,
  blinkAt: 30,
  isResting: false,
  hasIdea: false,
}

const isBlinking = (frame: number, blinkAt: number): boolean =>
  frame >= blinkAt && frame < blinkAt + 2

const nextBlink = (frame: number): number =>
  frame + (chance(0.2) ? 5 : between(40, 110))

// ------------------------------------------------------------------ acts ---

const chooseLead = (frame: number, isResting: boolean) => {
  const helpers = s.crew.size
  const previous = lead.act
  let act: LeadAct

  if (isResting) {
    act = pick<LeadAct>(
      [
        ['sleep', 6],
        ['peek', helpers > 0 ? 2 : 0],
        ['stretch', 1],
      ],
      'sleep',
    )
  } else {
    act = pick<LeadAct>(
      [
        ['run', 40],
        ['dash', s.mode === 'responding' ? 18 : 8],
        ['hop', 12],
        ['look', s.mode === 'thinking' ? 16 : 8],
        ['wave', 6],
        ['turn', helpers > 0 ? 10 : 0],
      ],
      'run',
    )

    // Nothing but running twice in a row: a show-off is a nuisance.
    if (act === previous && act !== 'run') {
      act = 'run'
    }
  }

  const span: Record<LeadAct, () => number> = {
    run: () => between(30, 80),
    dash: () => between(20, 40),
    hop: () => HOP.length * between(1, 3),
    look: () => between(18, 32),
    turn: () => between(16, 28),
    wave: () => between(15, 24),
    sleep: () => between(60, 140),
    peek: () => between(20, 36),
    stretch: () => between(10, 14),
  }

  lead.act = act
  lead.actAt = frame
  lead.actUntil = frame + span[act]()
  lead.isResting = isResting
  lead.hasIdea = act === 'look' && s.mode === 'thinking' && chance(0.4)
}

const chooseHelper = (m: Member, frame: number) => {
  let act: HelperAct

  if (m.kind === 'agent') {
    act = m.isWaiting
      ? 'rest'
      : pick<HelperAct>(
          [
            ['walk', 10],
            ['hop', 2],
            ['cheer', 1],
            ['carry', 2],
          ],
          'walk',
        )
  } else if (m.kind === 'shell') {
    act = pick<HelperAct>(
      [
        ['walk', 6],
        ['hop', 1],
        ['rest', 3],
      ],
      'walk',
    )
  } else {
    act = pick<HelperAct>(
      [
        ['scan', 6],
        ['stare', 2],
        ['shuffle', 2],
      ],
      'scan',
    )
  }

  const span: Record<HelperAct, () => number> = {
    walk: () => between(25, 70),
    hop: () => SMALL_HOP.length * between(1, 2),
    cheer: () => between(10, 16),
    carry: () => between(30, 60),
    rest: () => between(20, 50),
    scan: () => between(40, 90),
    stare: () => between(15, 30),
    shuffle: () => between(15, 30),
  }

  m.act = act
  m.actAt = frame
  m.actUntil = frame + span[act]()
}

// One tick of everybody's decisions, whatever is drawn.
const advance = (frame: number) => {
  let isResting = true

  for (const mount of s.mounted.values()) {
    if (mount.site === 'spinner') {
      isResting = false
    }
  }

  if (isResting !== lead.isResting || frame >= lead.actUntil) {
    chooseLead(frame, isResting)
  }

  if (frame >= lead.blinkAt + 2) {
    lead.blinkAt = nextBlink(frame)
  }

  for (const m of s.crew.values()) {
    if (frame >= m.actUntil) {
      chooseHelper(m, frame)
    }

    if (frame >= m.blinkAt + 2) {
      m.blinkAt = nextBlink(frame)
    }
  }
}

// ----------------------------------------------------------------- scene ---

const HOP = [0, -1, -2, -2, -2, -1, 0] as const
const SMALL_HOP = [0, -1, -2, -1, 0, 0] as const

// The lead, 7 x 3: l light, b body; eyes and limbs are drawn apart.
const LEAD = ['.lbbbb.', '.bbbbb.', '.bbbbb.']
// A subagent, 5 x 2: e eye, l light, b body.
const MINI = ['.ele.', '.bbb.']
// A background shell, 5 x 3: f frame; its screen is drawn apart.
const BOX = ['fffff', 'f...f', 'fffff']
// A monitor, 5 x 4: a antenna, p shell; its eye is drawn apart.
const BOT = ['..a..', '.ppp.', 'p...p', '.ppp.']

const POOF = [
  [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, -2]],
  [[-2, -2], [2, -2], [-2, 1], [2, 1], [0, -3]],
] as const

const streaks = (c: Canvas, frame: number, isDashing: boolean) => {
  const lines = isDashing
    ? [
        { y: GROUND - 2, len: 3, speed: 3, off: 0 },
        { y: GROUND - 1, len: 3, speed: 4, off: 2 },
        { y: GROUND - 3, len: 2, speed: 3, off: 4 },
      ]
    : [
        { y: GROUND - 2, len: 3, speed: 2, off: 0 },
        { y: GROUND - 1, len: 2, speed: 3, off: 2 },
      ]

  for (const line of lines) {
    const head = LANE - 1 - ((frame * line.speed + line.off) % (LANE + 3))

    for (let k = 0; k < line.len; k += 1) {
      const fade = Math.min(2, Math.floor((k / line.len) * 3))
      plot(c, head + k, line.y, C.trail[fade] ?? C.trail[2])
    }
  }
}

const poof = (c: Canvas, x: number, age: number) => {
  const step = Math.min(POOF.length - 1, Math.floor(age / 4))
  const rise = age >= 9 ? 1 : 0

  for (const [dx, dy] of POOF[step] ?? []) {
    plot(c, x + 2 + dx, GROUND - 1 + dy - rise, C.puff[step] ?? C.puff[2])
  }
}

const dust = (c: Canvas, left: number, right: number) => {
  plot(c, left, GROUND, C.dust)
  plot(c, right, GROUND, C.dust)
}

const drawLead = (c: Canvas, frame: number, x0: number, site: Site) => {
  const t = frame - lead.actAt
  const act = site === 'band' && !lead.isResting ? 'sleep' : lead.act
  const isRunning = act === 'run' || act === 'dash'
  const phase = Math.floor(t / (act === 'dash' ? 1 : 3)) % 4
  const isSitting = act === 'sleep' || act === 'peek'
  const isFlipped = act === 'turn'

  let lift = 0

  if (act === 'hop') {
    lift = HOP[t % HOP.length] ?? 0
  }

  const top = GROUND - 3 + lift + (isSitting ? 1 : 0)
  const at = (dx: number) => x0 + (isFlipped ? LEAD_W - 1 - dx : dx)

  // A dash leans into it: the head a pixel ahead.
  if (act === 'dash') {
    sprite(c, [LEAD[0] ?? ''], x0 + 1, top, { l: C.light, b: C.body })
    sprite(c, LEAD.slice(1), x0, top + 1, { l: C.light, b: C.body })
  } else {
    sprite(c, LEAD, x0, top, { l: C.light, b: C.body }, isFlipped)
  }

  // Eyes: shut asleep or blinking, else looking about.
  const isShut = act === 'sleep' || isBlinking(frame, lead.blinkAt)
  let look = 0

  if (act === 'look') {
    look = Math.floor(t / 8) % 2 === 0 ? -1 : 1
  } else if (act === 'turn' || act === 'peek') {
    look = -1 // back at the crew
  }

  for (const ex of [2, 4]) {
    plot(c, x0 + ex + look, top + 1, isShut ? (act === 'sleep' ? C.shade : C.body) : C.eye)
  }

  // Arms.
  if (act === 'stretch') {
    plot(c, at(0), top - 1, C.shade)
    plot(c, at(LEAD_W - 1), top - 1, C.shade)
    plot(c, at(0), top, C.shade)
    plot(c, at(LEAD_W - 1), top, C.shade)
  } else if (act === 'wave' || act === 'turn') {
    const isUp = Math.floor(t / 3) % 2 === 0
    plot(c, at(0), top + 2, C.shade)
    plot(c, at(LEAD_W - 1), isUp ? top - 1 : top, C.shade)
    plot(c, at(LEAD_W - 1), isUp ? top : top + 1, C.shade)
  } else if (isRunning) {
    plot(c, x0, phase < 2 ? top + 1 : top + 2, C.shade)
    plot(c, x0 + LEAD_W - 1, phase < 2 ? top + 2 : top + 1, C.shade)
  } else {
    plot(c, x0, top + 2, C.shade)
    plot(c, x0 + LEAD_W - 1, top + 2, C.shade)
  }

  // Legs: a trot (left, both, right, both), tucked in a hop, none sitting.
  if (!isSitting) {
    const feet = top + 3

    if (!isRunning || phase !== 2) {
      plot(c, x0 + 2, feet, C.shade)
    }

    if (!isRunning || phase !== 0) {
      plot(c, x0 + 4, feet, C.shade)
    }

    if (act === 'hop' && t % HOP.length === HOP.length - 1) {
      dust(c, x0 + 1, x0 + 5)
    }
  }

  // What is on its mind.
  if (act === 'sleep') {
    for (const lag of [0, 12]) {
      const age = (t + lag) % 24

      if (age < 18) {
        const rise = Math.floor(age / 6)
        plot(c, x0 + 5 + Math.floor(age / 9), top - 1 - rise, C.zz[rise] ?? C.zz[2])
      }
    }
  } else if (site === 'spinner' && act !== 'hop') {
    if (lead.hasIdea && t > 4) {
      if (t < 10 ? t % 2 === 0 : true) {
        plot(c, x0 + 3, top - 2, C.bulb)
      }
    } else if (s.mode === 'thinking') {
      const k = frame % 18

      if (k < 12) {
        plot(c, at(5), top - 1, C.thought)
      }

      if (k >= 6) {
        plot(c, at(6), top - 2, C.thought)
      }
    } else if (s.mode === 'tool-use' && noise(frame, 1) < 0.4) {
      const spots = [
        [6, top - 1],
        [5, top - 2],
        [6, top - 2],
      ] as const
      const spot = spots[Math.floor(noise(frame, 2) * spots.length)] ?? spots[0]
      const color = C.spark[Math.floor(noise(frame, 3) * C.spark.length)] ?? C.spark[0]
      plot(c, at(spot[0]), spot[1], color)
    }
  }
}

const drawAgent = (c: Canvas, frame: number, m: Member, x: number, lift: number) => {
  const t = frame - m.actAt
  const act = m.act
  const isWalking = act === 'walk' || act === 'carry'
  const phase = Math.floor((frame + m.offset) / 3) % 4
  const hop = act === 'hop' ? SMALL_HOP[t % SMALL_HOP.length] ?? 0 : 0
  const top = GROUND - 2 + lift + hop
  const light = mix(m.hue, 0xffffff, 0.35)
  const shade = mix(m.hue, 0x000000, 0.3)
  const eye = isBlinking(frame, m.blinkAt) ? m.hue : C.eye

  sprite(c, MINI, x, top, { e: eye, l: light, b: m.hue })

  // Arms: up with a box or a cheer, else swinging.
  if (act === 'carry') {
    for (let dx = 1; dx <= 3; dx += 1) {
      plot(c, x + dx, top - 1, C.box)
    }

    plot(c, x, top, shade)
    plot(c, x + HELPER_W - 1, top, shade)
  } else if (act === 'cheer') {
    const isUp = Math.floor(t / 2) % 2 === 0
    plot(c, x, isUp ? top - 1 : top, shade)
    plot(c, x + HELPER_W - 1, isUp ? top : top - 1, shade)
  } else if (isWalking) {
    plot(c, x, phase < 2 ? top : top + 1, shade)
    plot(c, x + HELPER_W - 1, phase < 2 ? top + 1 : top, shade)
  } else {
    plot(c, x, top + 1, shade)
    plot(c, x + HELPER_W - 1, top + 1, shade)
  }

  // Legs.
  if (!isWalking || phase !== 2) {
    plot(c, x + 1, top + 2, shade)
  }

  if (!isWalking || phase !== 0) {
    plot(c, x + 3, top + 2, shade)
  }

  if (act === 'hop' && t % SMALL_HOP.length === 4) {
    dust(c, x, x + HELPER_W - 1)
  }

  // A waiting agent taps its foot.
  if (m.isWaiting && Math.floor(frame / 4) % 2 === 0) {
    plot(c, x + 3, top + 2, NONE)
    plot(c, x + 4, top + 2, shade)
  }
}

const drawShell = (c: Canvas, frame: number, m: Member, x: number, lift: number) => {
  const t = frame - m.actAt
  const act = m.act
  const isWalking = act === 'walk'
  const phase = Math.floor((frame + m.offset) / 3) % 4
  const hop = act === 'hop' ? SMALL_HOP[t % SMALL_HOP.length] ?? 0 : 0
  const top = GROUND - 3 + lift + hop

  sprite(c, BOX, x, top, { f: SHELL.frame })

  // The screen: a line of output typed out, the cursor blinking, a scroll;
  // on its last ticks the result, green or red.
  const leftFor = m.leftAt === undefined ? undefined : frame - m.leftAt

  for (let i = 0; i < 3; i += 1) {
    let color: number = SHELL.screen

    if (leftFor !== undefined && m.outcome !== 'stop') {
      color = leftFor % 2 === 0 ? (m.outcome === 'fail' ? SHELL.fail : SHELL.ok) : SHELL.screen
    } else {
      const pos = Math.floor((frame + m.offset) / 2) % 7

      if (i < pos) {
        color = noise(frame + i, m.offset) < 0.75 ? SHELL.text : SHELL.dim
      } else if (i === pos) {
        color = frame % 6 < 3 ? SHELL.cursor : SHELL.screen
      }
    }

    plot(c, x + 1 + i, top + 1, color)
  }

  // Legs.
  if (!isWalking || phase !== 2) {
    plot(c, x + 1, top + 3, SHELL.leg)
  }

  if (!isWalking || phase !== 0) {
    plot(c, x + 3, top + 3, SHELL.leg)
  }
}

const drawMonitor = (c: Canvas, frame: number, m: Member, x: number, lift: number) => {
  const t = frame - m.actAt
  const sinceAlert = frame - m.alertAt
  const isAlert = sinceAlert >= 0 && sinceAlert < ALERT_TICKS
  const hop = isAlert && sinceAlert < SMALL_HOP.length * 2 ? SMALL_HOP[sinceAlert % SMALL_HOP.length] ?? 0 : 0
  const top = GROUND - 4 + lift + hop

  // The antenna: a slow red light on air, a quick yellow one on an event.
  let antenna: number = MONITOR.off

  if (isAlert) {
    antenna = frame % 2 === 0 ? MONITOR.alert : MONITOR.led
  } else if ((frame + m.offset * 2) % 24 < 4) {
    antenna = MONITOR.led
  }

  sprite(c, BOT, x, top, { a: antenna, p: MONITOR.shell })

  // The eye: scanning side to side, staring, or wide open on an event.
  const SCAN = [0, 1, 2, 1] as const
  let pupil = 1

  if (!isAlert && m.act === 'scan') {
    pupil = SCAN[Math.floor((frame + m.offset) / 6) % SCAN.length] ?? 1
  }

  const isShut = !isAlert && isBlinking(frame, m.blinkAt)

  for (let i = 0; i < 3; i += 1) {
    const color = isShut ? MONITOR.shell : i === pupil ? MONITOR.pupil : MONITOR.white
    plot(c, x + 1 + i, top + 2, color)
  }

  // Feet: stubby, shuffling now and then.
  const isShuffling = m.act === 'shuffle' && Math.floor(t / 3) % 2 === 0
  plot(c, x + 1, top + 4 - (isShuffling ? 1 : 0), MONITOR.leg)
  plot(c, x + 3, top + 4, MONITOR.leg)
}

const drawHelper = (c: Canvas, frame: number, m: Member, x: number) => {
  const age = frame - m.bornAt

  if (m.leftAt !== undefined) {
    const leftFor = frame - m.leftAt
    const flash = m.kind === 'shell' && m.outcome !== 'stop' ? FLASH_TICKS : 0

    if (leftFor >= flash) {
      poof(c, x, leftFor - flash)

      return
    }
  }

  // A newcomer drops in from above and lands in a puff of dust.
  const lift = age < ARRIVE_TICKS ? -(ARRIVE_TICKS - age) : 0

  if (age >= ARRIVE_TICKS && age < ARRIVE_TICKS + 3) {
    dust(c, x - 1, x + HELPER_W)
  }

  if (m.kind === 'agent') {
    drawAgent(c, frame, m, x, lift)
  } else if (m.kind === 'shell') {
    drawShell(c, frame, m, x, lift)
  } else {
    drawMonitor(c, frame, m, x, lift)
  }
}

const drawMore = (c: Canvas, frame: number, x: number) => {
  const lit = Math.floor(frame / 4) % 3

  for (let i = 0; i < 3; i += 1) {
    plot(c, x + i, GROUND - 1, i === lit ? C.more[0] : C.more[1])
  }
}

const scene = (frame: number, mount: Mount): Canvas => {
  const c = canvas(mount.width)
  const isMoving =
    mount.site === 'spinner' && (lead.act === 'run' || lead.act === 'dash' || lead.act === 'hop')

  if (isMoving) {
    streaks(c, frame, lead.act === 'dash')
  }

  if (mount.more > 0) {
    drawMore(c, frame, LANE)
  }

  for (const slot of mount.slots) {
    const m = s.crew.get(slot.id)

    if (m !== undefined) {
      drawHelper(c, frame, m, slot.x)
    }
  }

  drawLead(c, frame, mount.width - LEAD_W, mount.site)

  return c
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
const toCells = (c: Canvas): string => {
  const bytes = new Uint8Array(c.w * ROWS * 12)
  let at = 0

  const put = (value: number) => {
    bytes[at] = value & 255
    bytes[at + 1] = (value >>> 8) & 255
    bytes[at + 2] = (value >>> 16) & 255
    bytes[at + 3] = (value >>> 24) & 255
    at += 4
  }

  for (let cy = 0; cy < ROWS; cy += 1) {
    for (let cx = 0; cx < c.w; cx += 1) {
      const top = c.px[cy * 2 * c.w + cx] ?? NONE
      const bottom = c.px[(cy * 2 + 1) * c.w + cx] ?? NONE

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

// ---------------------------------------------------------------- layout ---

const KIND_ORDER: Record<Kind, number> = { monitor: 0, shell: 1, agent: 2 }

// Left to right: speed lines, "..." for those past the cap, monitors, shells,
// subagents, and the lead at the right edge. `columns` caps the crew so it
// never takes more than its share of the row.
const layout = (site: Site, columns: number | undefined): Mount => {
  const share = columns === undefined ? Infinity : site === 'spinner' ? columns / 2 : columns
  const room = Math.floor((share - LANE - MORE_W - LEAD_W) / (HELPER_W + GAP))
  const cap = Math.max(0, Math.min(MAX_HELPERS, room))
  const helpers = [...s.crew.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.bornAt - b.bornAt,
  )
  const shown = helpers.slice(Math.max(0, helpers.length - cap))
  const more = helpers.length - shown.length
  let x = LANE + (more > 0 ? MORE_W : 0)

  const slots = shown.map(m => {
    const slot = { id: m.id, x }
    x += HELPER_W + GAP

    return slot
  })

  return { site, key: site === 'spinner' ? 'critter' : 'crew', slots, more, width: x + LEAD_W, denied: 0 }
}

// ----------------------------------------------------------------- corner ---

// The engine has no overlay slot at the top of the screen, so the crew is
// drawn from the working row with a negative `top`: the row's distance from
// the top, which is the terminal's height less the rows under it (the prompt
// box, its hint line and the footer). Tune this one number if the crew sits
// a row too low (lower it) or loses its top off the screen (raise it).
const ROWS_BELOW_SPINNER = 6
const MIN_ROWS_FOR_CORNER = 14

// Fullscreen only: the inline layout has no fixed top to pin to, so there the
// crew stands on the working label's row instead.
const cornerOffset = (viewport?: { rows?: number; isFullscreen?: boolean }): number => {
  const rows = viewport?.rows

  if (viewport?.isFullscreen !== true || rows === undefined || rows < MIN_ROWS_FOR_CORNER) {
    return -(ROWS - 1)
  }

  return -(rows - 1 - ROWS_BELOW_SPINNER)
}

// ------------------------------------------------------------------ timer ---

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
    advance(s.frame)

    for (const m of [...s.crew.values()]) {
      const flash = m.kind === 'shell' && m.outcome !== 'stop' ? FLASH_TICKS : 0

      if (m.leftAt !== undefined && s.frame - m.leftAt >= flash + LEAVE_TICKS) {
        s.crew.delete(m.id)
        s.isDirty = true
      }
    }

    if (s.isDirty) {
      s.isDirty = false
      $.ui.invalidate('ui.render')
    }

    if (s.frame % SYNC_TICKS === 0) {
      void syncAgents($)
    }

    if (s.mounted.size === 0) {
      s.idle += 1

      if (s.idle > IDLE_TICKS) {
        stop()
      }

      return
    }

    s.idle = 0

    for (const [id, mount] of [...s.mounted]) {
      const cells = toCells(scene(s.frame, mount))
      const result = await $.ui.blit({ requestId: id, key: mount.key, cells })

      if (result.deny === undefined) {
        mount.denied = 0
      } else if (mount.denied + 1 >= GRACE_TICKS) {
        s.mounted.delete(id)
      } else {
        mount.denied += 1
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
    // No timer here: the crew stands still instead.
  }
}

// ------------------------------------------------------------ bookkeeping ---

const join = ($: EngineInterface, id: string, kind: Kind) => {
  const known = s.crew.get(id)

  if (known !== undefined) {
    // Back before its puff finished (a teammate's next turn): stay.
    known.leftAt = undefined
    known.outcome = undefined

    return
  }

  const h = hash(id)

  s.crew.set(id, {
    id,
    kind,
    hue: AGENT_HUES[h % AGENT_HUES.length] ?? C.body,
    offset: h % 12,
    bornAt: s.frame,
    leftAt: undefined,
    outcome: undefined,
    isWaiting: false,
    alertAt: -Infinity,
    act: kind === 'monitor' ? 'scan' : 'walk',
    actAt: s.frame,
    actUntil: s.frame + between(10, 30),
    blinkAt: s.frame + between(20, 80),
  })
  s.isDirty = true
  start($)
}

const leave = ($: EngineInterface, id: string, outcome: Outcome) => {
  const m = s.crew.get(id)

  if (m === undefined || m.leftAt !== undefined) {
    return
  }

  m.leftAt = s.frame
  m.outcome = outcome
  start($)
}

const LIVE = new Set<string>(['pending', 'running', 'waiting'])

// The agent list is the truth about subagents: join the live ones, and let go
// of those it calls ended (or has not named for a while).
const syncAgents = async ($: EngineInterface) => {
  if (s.isSyncing) {
    return
  }

  s.isSyncing = true

  try {
    const agents = await $.agent.list()
    const byId = new Map(agents.map(agent => [agent.id, agent]))

    for (const agent of agents) {
      if (!LIVE.has(agent.status)) {
        continue
      }

      join($, agent.id, 'agent')

      const m = s.crew.get(agent.id)
      const isWaiting = agent.status === 'waiting'

      if (m !== undefined && m.isWaiting !== isWaiting) {
        m.isWaiting = isWaiting
        m.actUntil = s.frame
      }
    }

    for (const m of s.crew.values()) {
      if (m.kind !== 'agent' || m.leftAt !== undefined) {
        continue
      }

      const agent = byId.get(m.id)

      if (agent === undefined ? s.frame - m.bornAt > AGENT_GRACE_TICKS : !LIVE.has(agent.status)) {
        leave($, m.id, agent?.status === 'failed' ? 'fail' : agent?.status === 'killed' ? 'stop' : 'ok')
      }
    }
  } catch {
    // No agent list here: turn.start and turn.complete keep the count.
  } finally {
    s.isSyncing = false
  }
}

const field = (value: unknown, key: string): string | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const found: unknown = (value as Record<string, unknown>)[key]

  return typeof found === 'string' && found !== '' ? found : undefined
}

// A finished tool call: a command sent to the background (asked for, ctrl+b,
// or past its timeout), a monitor armed, a task stopped.
const noteTool = ($: EngineInterface, tool: string, response: unknown) => {
  if (tool === 'Bash' || tool === 'PowerShell') {
    const id = field(response, 'backgroundTaskId')

    if (id !== undefined) {
      join($, id, 'shell')
    }
  } else if (tool === 'Monitor') {
    const id = field(response, 'taskId')

    if (id !== undefined) {
      join($, id, 'monitor')
    }
  } else if (tool === 'TaskStop' || tool === 'KillShell' || tool === 'KillBash') {
    const id = field(response, 'task_id') ?? field(response, 'shell_id')

    if (id !== undefined) {
      leave($, id, 'stop')
    }
  }
}

const statusOutcome = (status: string): Outcome =>
  status === 'completed' ? 'ok' : status === 'failed' ? 'fail' : 'stop'

// `<task-notification>`s: one with a `<status>` says the task ended; a
// monitor's without one is an event it saw.
const readNotes = ($: EngineInterface, text: string) => {
  for (const chunk of text.split('<task-notification>').slice(1)) {
    const body = chunk.split('</task-notification>')[0] ?? chunk
    const id = /<task-id>([^<]+)<\/task-id>/.exec(body)?.[1]?.trim()
    const m = id === undefined ? undefined : s.crew.get(id)

    if (id === undefined || m === undefined) {
      continue
    }

    const status = /<status>([^<]+)<\/status>/.exec(body)?.[1]?.trim()

    if (status !== undefined) {
      leave($, id, statusOutcome(status))
    } else if (m.kind === 'monitor') {
      m.alertAt = s.frame
      start($)
    }
  }
}

// A Stop's list of background work in flight settles the shells and monitors:
// it names any the mod missed (after a reload) and drops any it did not hear
// end.
const reconcile = (
  $: EngineInterface,
  tasks: ReadonlyArray<{ id: string; type: string }> | undefined,
) => {
  if (tasks === undefined) {
    return
  }

  const live = new Map<string, Kind>()

  for (const task of tasks) {
    if (task.type === 'shell' || task.type === 'monitor') {
      live.set(task.id, task.type)
    }
  }

  for (const m of s.crew.values()) {
    if (m.kind !== 'agent' && m.leftAt === undefined && !live.has(m.id)) {
      leave($, m.id, 'stop')
    }
  }

  for (const [id, kind] of live) {
    join($, id, kind)
  }
}

// ------------------------------------------------------------------- mod ---

// Bookkeeping never stands in an event's way: a slip here costs a critter,
// not the event (these hooks only watch, so failing open is right).
const quietly = (work: () => void) => {
  try {
    work()
  } catch {
    // The crew is a picture; the next check puts it right.
  }
}

export const register: Register = on => {
  on('turn.start', ($, e, next) => {
    quietly(() => {
      if (e.agentId === undefined) {
        start($)
      } else {
        join($, e.agentId, 'agent')
      }
    })

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    quietly(() => {
      if (e.agentId !== undefined) {
        leave($, e.agentId, e.reason === 'error' ? 'fail' : e.isAborted ? 'stop' : 'ok')
      } else if (s.crew.size === 0) {
        stop()
      }
    })

    return next(e)
  })

  on('classic.PostToolUse', ($, e, next) => {
    quietly(() => noteTool($, e.tool_name, e.tool_response))

    return next(e)
  })

  on('classic.Stop', ($, e, next) => {
    quietly(() => reconcile($, e.background_tasks))

    return next(e)
  })

  on('classic.SubagentStop', ($, e, next) => {
    quietly(() => reconcile($, e.background_tasks))

    return next(e)
  })

  on('session.append', ($, e, next) => {
    quietly(() => {
      for (const block of e.message.content) {
        const text = block.type === 'text' ? block.text : undefined

        if (typeof text === 'string' && text.includes('<task-notification>')) {
          readNotes($, text)
        }
      }
    })

    return next(e)
  })

  // The row that carries Claude's own "working" label: keep it whole, and
  // hang the crew over its empty right end.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    s.mode = e.props.mode

    const mount = layout('spinner', e.viewport?.columns)
    s.mounted.set(e.requestId, mount)
    start($)

    const label = await next(e)
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box>
        {label}
        <Box position="absolute" right={0} top={cornerOffset(e.viewport)}>
          <Raster
            key={mount.key}
            columns={mount.width}
            rows={ROWS}
            cells={toCells(scene(s.frame, mount))}
          />
        </Box>
      </Box>
    )
  })

  // Between turns, while background work goes on: the crew in the band above
  // the prompt, the lead asleep at its end.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    const isShown =
      e.surface === 'terminal' && !e.props.isWorking && !e.props.hasSurvey && s.crew.size > 0

    if (!isShown) {
      s.mounted.delete(e.requestId)

      return next(e)
    }

    const mount = layout('band', e.props.bodyColumns)
    s.mounted.set(e.requestId, mount)
    start($)

    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box justifyContent="flex-end">
        <Raster
          key={mount.key}
          columns={mount.width}
          rows={ROWS}
          cells={toCells(scene(s.frame, mount))}
        />
      </Box>
    )
  })
}
