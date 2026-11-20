// The guided-tour panel (guided-tour.md, next to this folder). Three modes, set in window.__tourMode
// before this script runs:
// - "docked" (the default of `open.mjs --tour` and of `demo.mjs`): the panel fills its own control
//   window at the right edge of the screen (tour-control.mjs, next to this file);
// - "ring": on the app pages beside it, only the pulsing ring around the element the current step names;
// - "overlay" (`open.mjs --panel overlay`): the panel floats on every app page, draggable.
// It lives in a shadow root on <html>, outside <body>, so it neither inherits the page's styles nor
// shows up in the page text. It goes on every surface the project has (an app, a public site, a mail
// catcher), so it carries its own palette, light or dark like the page (`data-theme` on <html>, else
// the system's), and its violet accent keeps it apart from the app's UI. Its stylesheet is a
// constructed one: a page's CSP (`style-src` without 'unsafe-inline') does not block it. State comes
// from the Node side (window.__tourGet / __tourRender); the person's answers go back through
// window.__tourSend. Managed by /shipkit:forge.
(() => {
    // Top-level pages only: a preview frame inside the page never gets a second panel.
    try {
        if (window.top !== window) {
            return;
        }
    } catch {
        return;
    }

    if (window.__tourPanel) {
        return;
    }

    window.__tourPanel = true;

    const mode = window.__tourMode ?? 'overlay';
    const docked = mode === 'docked';
    const ringOnly = mode === 'ring';

    const css = `
:host {
    all: initial; --tour: #7c3aed; --tour-fg: #fff;
    --bg: #fff; --fg: #171717; --soft: #f4f4f5; --line: #e4e4e7; --dim: #6b7280; --go: #15803d;
    --done-bg: #dcfce7; --done-fg: #14532d; --ring: #a3a3a3;
}
:host(.dark) {
    --bg: #18181b; --fg: #f4f4f5; --soft: #27272a; --line: #3f3f46; --dim: #a1a1aa; --go: #4ade80;
    --done-bg: #14532d; --done-fg: #dcfce7; --ring: #71717a;
}
* { box-sizing: border-box; }
.panel {
    position: fixed; z-index: 2147483647; bottom: 16px; right: 16px; width: 360px; max-height: 70vh;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg); color: var(--fg);
    border: 2px solid var(--tour); border-radius: 14px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.28);
    font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.panel.left { right: auto; left: 16px; }
.panel.collapsed { width: auto; border-radius: 999px; }
.body { overflow-y: auto; padding: 12px 14px 14px; }
header { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px;
    background: var(--soft); border-bottom: 1px solid var(--line); }
.badge { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    background: var(--tour); color: var(--tour-fg); padding: 2px 8px; border-radius: 999px; }
.status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dim); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: #16a34a; }
.dot.working { background: #d97706; animation: blink 1s ease-in-out infinite; }
.dot.done { background: var(--tour); }
@keyframes blink { 50% { opacity: .3; } }
button { font: inherit; color: inherit; cursor: pointer; border: 1px solid var(--line);
    background: var(--bg); border-radius: 8px; padding: 6px 10px; }
button:disabled { opacity: .4; cursor: default; }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.tool { border: 0; background: transparent; padding: 2px 6px; font-size: 16px; line-height: 1; }
h2 { margin: 0 0 2px; font-size: 15px; font-weight: 650; }
.me { margin: 0 0 10px; font-size: 12px; color: var(--dim); }
.count { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--dim); }
.elsewhere { margin: 0 0 8px; padding: 6px 8px; border-radius: 8px; background: var(--soft); }
.do { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.see { margin: 0 0 10px; color: var(--go); }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft);
    border: 1px solid var(--line); border-radius: 5px; padding: 0 4px; color: var(--fg); }
.link { width: 100%; margin-bottom: 10px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 6px; }
.actions .ok { flex: 1; background: #16a34a; border-color: #16a34a; color: #fff; font-weight: 600; }
.actions .bad, form .bad { background: #dc2626; border-color: #dc2626; color: #fff; font-weight: 600; }
form { margin-top: 10px; display: grid; gap: 6px; }
form div { display: flex; gap: 6px; }
textarea { font: inherit; color: inherit; width: 100%; resize: vertical; padding: 6px 8px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.list { list-style: none; margin: 12px 0 0; padding: 10px 0 0; border-top: 1px solid var(--line); display: grid; gap: 2px; }
.list button { width: 100%; text-align: left; border: 0; background: transparent; padding: 3px 6px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dim); }
.list .cur button { background: var(--soft); color: var(--fg); font-weight: 600; }
.list .ok button::before { content: "✓ "; color: #16a34a; }
.list .problem button::before { content: "✗ "; color: #dc2626; }
.done { margin: 10px 0 0; padding: 8px; border-radius: 8px; background: var(--done-bg); color: var(--done-fg); font-weight: 600; }
.pill { display: flex; align-items: center; gap: 8px; border: 0; background: transparent; padding: 8px 14px; font-weight: 600; }
header, .pill { cursor: grab; touch-action: none; user-select: none; }
.grip { color: var(--dim); font-size: 17px; line-height: 1; margin-left: -4px; }
.panel.dragging, .panel.dragging * { cursor: grabbing; user-select: none; }
.panel.dragging { box-shadow: 0 18px 50px rgb(0 0 0 / 0.35); }
.ring { position: fixed; z-index: 2147483646; pointer-events: none; display: none;
    border: 3px solid var(--tour); border-radius: 8px; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgb(124 58 237 / .5); } 50% { box-shadow: 0 0 0 8px rgb(124 58 237 / 0); } }
@media (max-width: 480px) {
    .panel, .panel.left { left: 8px; right: 8px; bottom: 8px; width: auto; max-height: 48vh; }
    .panel.collapsed { left: auto; right: 8px; }
}`;

    // The control window ("docked") has its own layout, made to be read at a glance: the title and a
    // progress bar at the top, the step in the middle (the window it happens in, what to do, what to see),
    // and the buttons pinned at the bottom, always in the same place. Same violet accent as the ring on
    // the app windows; light or dark like the system.
    const dockedCss = `
:host { all: initial; }
* { box-sizing: border-box; }
.cw {
    --bg: #f6f6f8; --surface: #ffffff; --fg: #18181b; --muted: #62626d; --line: #e4e4e9; --line-strong: #d1d1d9;
    --hover: #f0f0f4; --accent: #6d28d9; --accent-hover: #5b21b6; --accent-fg: #ffffff; --accent-soft: #f3effe;
    --accent-line: #ddd1fb; --accent-ink: #5b21b6; --ok: #15803d; --ok-soft: #ecf8f0; --ok-line: #bfe6cc;
    --ok-ink: #14532d; --bad: #b91c1c; --bad-soft: #fdf0f0; --bad-line: #f3c5c5; --bad-ink: #7f1d1d;
    --say-bg: #faf8ff; --focus: #8b5cf6; --disabled-bg: #ececf0; --disabled-fg: #8a8a94;
    position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column;
    background: var(--bg); color: var(--fg);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
}
:host(.dark) .cw {
    --bg: #0e0e11; --surface: #17171b; --fg: #f4f4f5; --muted: #a1a1aa; --line: #2a2a31; --line-strong: #3b3b44;
    --hover: #222228; --accent: #7c3aed; --accent-hover: #8b5cf6; --accent-soft: #211a35; --accent-line: #3d2e66;
    --accent-ink: #c4b5fd; --ok: #15803d; --ok-soft: #0f2418; --ok-line: #1f4d31; --ok-ink: #86efac;
    --bad: #dc2626; --bad-soft: #2a1313; --bad-line: #5c2323; --bad-ink: #fca5a5; --say-bg: #1b1824;
    --focus: #a78bfa; --disabled-bg: #26262c; --disabled-fg: #85858f;
}
.top { padding: 18px 20px 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
.over { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; letter-spacing: .05em;
    text-transform: uppercase; color: var(--muted); }
.brand { width: 8px; height: 8px; border-radius: 2px; background: var(--accent); flex: none; }
h1 { margin: 6px 0 14px; font-size: 21px; line-height: 1.25; font-weight: 700; letter-spacing: -.01em; }
.bar { display: flex; gap: 4px; }
.bar i { flex: 1; height: 6px; border-radius: 3px; background: var(--line); }
.bar i.cur { background: var(--accent); }
.bar i.ok { background: var(--ok); }
.bar i.problem { background: var(--bad); }
.count { margin: 8px 0 0; display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted); }
.count .bad { color: var(--bad-ink); font-weight: 600; }
.scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
.flash { margin: 0; display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px;
    font-size: 14px; line-height: 1.45; border: 1px solid; }
.flash .ic { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 800; color: #fff; margin-top: 1px; }
.flash.ok { background: var(--ok-soft); border-color: var(--ok-line); color: var(--ok-ink); }
.flash.ok .ic { background: var(--ok); }
.flash.bad { background: var(--bad-soft); border-color: var(--bad-line); color: var(--bad-ink); }
.flash.bad .ic { background: var(--bad); }
.flash.plain { background: var(--surface); border-color: var(--line); color: var(--muted); }
.flash b { font-weight: 700; }
.now { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px;
    display: flex; flex-direction: column; gap: 12px; transition: border-color .2s, box-shadow .2s; }
.now.working { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); }
.where { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; max-width: 100%;
    padding: 3px 10px 3px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink);
    font-size: 13px; font-weight: 600; }
.where svg { flex: none; }
.where span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.do { margin: 0; font-size: 19px; line-height: 1.35; font-weight: 650; }
.say { padding: 12px 14px; border-radius: 10px; background: var(--say-bg); border-left: 4px solid var(--accent); }
.say.expect { border-left-color: var(--ok); background: var(--ok-soft); }
.label { margin: 0 0 4px; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700;
    letter-spacing: .05em; text-transform: uppercase; color: var(--accent-ink); }
.say.expect .label { color: var(--ok-ink); }
.say p:last-child { margin: 0; font-size: 17px; line-height: 1.5; }
.open { align-self: flex-start; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.endcard { background: var(--surface); border: 1px solid var(--ok-line); border-radius: 14px; padding: 18px 16px;
    display: flex; flex-direction: column; gap: 10px; }
.endcard.bad { border-color: var(--bad-line); }
.endcard .big { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; }
.endcard .tick { flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--ok); color: #fff;
    display: grid; place-items: center; font-size: 16px; font-weight: 800; }
.endcard.bad .tick { background: var(--bad); }
.endcard p { margin: 0; font-size: 16px; }
.endcard .then { font-size: 14px; color: var(--muted); }
.steps h2 { margin: 4px 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    color: var(--muted); }
.steps ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.steps li > * { box-sizing: border-box; width: 100%; display: flex; gap: 10px; align-items: flex-start; padding: 7px 8px;
    border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 14px; line-height: 1.4;
    color: var(--muted); text-align: left; }
.steps li button { cursor: pointer; }
.steps li button:hover { background: var(--hover); }
.steps .n { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 700; border: 1.5px solid var(--line-strong); color: var(--muted); }
.steps .ok .n { background: var(--ok); border-color: var(--ok); color: #fff; }
.steps .problem .n { background: var(--bad); border-color: var(--bad); color: #fff; }
.steps .ok > *, .steps .problem > * { color: var(--fg); }
.steps .cur > * { background: var(--surface); color: var(--fg); font-weight: 650; box-shadow: inset 0 0 0 1px var(--line); }
.steps .cur .n { background: var(--accent); border-color: var(--accent); color: #fff; }
.dock { background: var(--surface); border-top: 1px solid var(--line); padding: 12px 20px 16px;
    display: flex; flex-direction: column; gap: 10px; }
.next { margin: 0; display: flex; align-items: center; gap: 8px; min-height: 21px; font-size: 14px; color: var(--muted); }
.btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border: 0; border-radius: 10px; font: inherit; font-weight: 650; cursor: pointer; text-align: center; }
.btn:focus-visible, textarea:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.btn[disabled] { cursor: default; }
.primary { width: 100%; min-height: 56px; padding: 0 16px 0 20px; font-size: 17px; background: var(--accent);
    color: var(--accent-fg); }
.primary:hover:not([disabled]) { background: var(--accent-hover); }
.primary[disabled] { background: var(--disabled-bg); color: var(--disabled-fg); }
.primary .txt { flex: 1; text-align: left; }
.row { display: flex; gap: 8px; }
.row > .btn { flex: 1; }
.good { min-height: 56px; font-size: 16px; background: var(--ok); color: #fff; }
.good:hover:not([disabled]) { filter: brightness(1.08); }
.good[disabled] { background: var(--disabled-bg); color: var(--disabled-fg); }
.no { min-height: 56px; font-size: 16px; background: var(--surface); color: var(--bad-ink); box-shadow: inset 0 0 0 1.5px var(--bad-line); }
.no:hover:not([disabled]) { background: var(--bad-soft); }
.no[disabled] { opacity: .5; }
.back { flex: 0 0 56px !important; min-height: 56px; font-size: 18px; background: var(--surface); color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--line-strong); }
.back[disabled] { opacity: .4; }
.ghost { min-height: 40px; padding: 0 12px; font-size: 14px; background: transparent; color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--line-strong); }
.ghost:hover { background: var(--hover); }
.ghost.on { background: var(--accent-soft); color: var(--accent-ink); box-shadow: inset 0 0 0 1px var(--accent-line); }
kbd { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 4px 6px; border-radius: 5px;
    background: rgb(255 255 255 / .2); color: inherit; }
.ghost kbd, .no kbd, .back kbd { background: var(--hover); color: var(--muted); }
form { display: flex; flex-direction: column; gap: 8px; }
form .label { color: var(--fg); letter-spacing: .03em; }
textarea { font: inherit; font-size: 15px; color: var(--fg); background: var(--surface); width: 100%; min-height: 92px;
    resize: vertical; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line-strong); }
.hint { margin: 0; font-size: 12px; color: var(--muted); }
.save { min-height: 44px; font-size: 15px; background: var(--accent); color: var(--accent-fg); }
.save.bad { background: var(--bad); color: #fff; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--hover); border: 1px solid var(--line);
    border-radius: 5px; padding: 0 4px; }
.spin { flex: none; width: 15px; height: 15px; border-radius: 50%; border: 2px solid currentColor;
    border-right-color: transparent; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2.4s; } .now { transition: none; } }`;

    // pos: where the person dragged the panel ({ x, y } of its top-left corner), or null for the corner.
    const ui = { collapsed: false, side: 'right', problem: false, pos: null };

    try {
        Object.assign(
            ui,
            JSON.parse(sessionStorage.getItem('__tour_ui') ?? '{}'),
        );
    } catch {
        // Storage can be blocked (an opaque origin); the defaults are fine.
    }

    ui.problem = false;

    const saveUi = () => {
        try {
            sessionStorage.setItem(
                '__tour_ui',
                JSON.stringify({
                    collapsed: ui.collapsed,
                    side: ui.side,
                    pos: ui.pos,
                }),
            );
        } catch {
            // Ignore.
        }
    };

    let state = null;
    let host;
    let panel;
    let ring;

    const esc = (text) =>
        String(text ?? '').replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c],
        );
    // `label` becomes <code>label</code>, everything else is escaped.
    const fmt = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
    // The control window's own words; a tour or a demo can replace any of them (`state.i18n`), in the
    // language of the product (project.md §Language).
    const words = {
        step: 'Step',
        of: 'of',
        goTo: 'Go to',
        waiting: 'Waiting for the steps…',
        allDone: 'All steps checked. You can close the windows.',
        say: 'Say',
        expectLabel: 'What you should see',
        stepsTitle: 'Steps',
        working: 'Running…',
        autoOn: 'No stops',
        autoOff: 'Stop',
        autoRunning: 'Running on its own…',
        sceneDone: 'Done',
        failed: 'did not work',
        worked: 'worked',
        back: 'Previous step (←)',
        send: 'Save the note',
        cancel: 'Cancel',
        noteTitle: 'Note',
        verdictTitle: 'What is not right?',
        sendVerdict: 'Send',
        looksRight: '✓ Looks right',
        problem: '✗ Problem',
        next: '▶ Next',
        problemHint: 'What is wrong? (a screenshot of the window is attached)',
    };
    const t = (key) => state?.i18n?.[key] ?? words[key];

    // Light or dark like the page: its own switch first (`data-theme` on <html>), else the system's.
    function theme() {
        if (!host) {
            return;
        }

        const set = document.documentElement?.dataset?.theme;
        const dark =
            set === 'dark' ||
            (set !== 'light' &&
                window.matchMedia?.('(prefers-color-scheme: dark)').matches);

        host.classList.toggle('dark', Boolean(dark));
    }

    function mount() {
        if (host?.isConnected) {
            return;
        }

        if (!host) {
            host = document.createElement('shipkit-tour');
            const root = host.attachShadow({ mode: 'open' });
            const sheet = new CSSStyleSheet();

            sheet.replaceSync(docked ? dockedCss : css);
            root.adoptedStyleSheets = [sheet];
            root.innerHTML = docked
                ? '<section class="cw"></section>'
                : `<div class="ring"></div>${ringOnly ? '' : '<section class="panel"></section>'}`;
            ring = root.querySelector('.ring');
            panel = root.querySelector('.panel, .cw');

            if (panel) {
                panel.addEventListener('click', onClick);
                panel.addEventListener('submit', onSubmit);
                panel.addEventListener('pointerdown', onPointerDown);
                panel.addEventListener('dblclick', onDoubleClick);
            }

            window.addEventListener('resize', place);
        }

        document.documentElement.appendChild(host);
        theme();
    }

    function currentStep() {
        return state?.steps?.[state.current] ?? null;
    }

    function isMine(step) {
        return !step?.window || !state?.me || step.window === state.me;
    }

    // A step's `path` is a path on this page's site or a whole address on another one.
    function target(path) {
        try {
            return new URL(path, location.href);
        } catch {
            return null;
        }
    }

    function isHere(path) {
        const url = target(path);

        return (
            !url ||
            (url.origin === location.origin && url.pathname === location.pathname)
        );
    }

    function render(next) {
        if (next) {
            state = next;
        }

        if (!state || !document.documentElement) {
            return;
        }

        mount();

        if (ringOnly) {
            return;
        }

        if (docked) {
            renderDocked();

            return;
        }

        // Keep what the person is typing across re-renders.
        const draft = panel.querySelector('textarea')?.value;
        const step = currentStep();
        const total = state.steps?.length ?? 0;
        const light = state.done ? 'done' : (state.state ?? 'ready');
        const status = esc(state.status || 'Ready');

        panel.className = `panel ${ui.side}${ui.collapsed ? ' collapsed' : ''}${dragged ? ' dragging' : ''}`;

        if (ui.collapsed) {
            panel.innerHTML = `<button class="pill" data-act="expand" title="Open the tour"><span class="dot ${light}"></span>Tour${
                total ? ` · ${state.current + 1}/${total}` : ''
            } · ${status}</button>`;
            place();

            return;
        }

        const stepHtml = step
            ? `<p class="count">Step ${state.current + 1} of ${total}${step.window ? ` · ${esc(step.window)}` : ''}</p>
${isMine(step) ? '' : `<p class="elsewhere">→ Do this one in the <b>${esc(step.window)}</b> window.</p>`}
<p class="do">${fmt(step.do)}</p>
${step.see ? `<p class="see">✓ ${fmt(step.see)}</p>` : ''}
${isMine(step) && step.path && !isHere(step.path) ? `<button class="link" data-act="open" title="${esc(step.path)}">Go to ${esc(step.path)}</button>` : ''}
${
    state.done
        ? ''
        : `<div class="actions">
  <button data-act="back" title="Previous step" ${state.current === 0 ? 'disabled' : ''}>←</button>
  <button class="ok" data-act="ok">✓ Looks right</button>
  <button class="bad" data-act="problem">✗ Problem</button>
</div>`
}
${ui.problem ? '<form><textarea rows="3" placeholder="What is wrong? (a screenshot is attached)"></textarea><div><button type="submit" class="bad">Send</button><button type="button" data-act="cancel">Cancel</button></div></form>' : ''}
<ol class="list">${state.steps
                  .map(
                      (s, i) =>
                          `<li class="${i === state.current ? 'cur ' : ''}${state.results?.[i] ?? ''}"><button data-act="go" data-i="${i}" title="${esc(s.do)}">${i + 1}. ${esc(String(s.do ?? '').replace(/`/g, ''))}</button></li>`,
                  )
                  .join('')}</ol>`
            : '<p class="do">Waiting for the steps…</p>';

        panel.innerHTML = `<header title="Drag to move · double-click to snap back"><span class="grip" aria-hidden="true">⠿</span><span class="badge">Tour</span><span class="dot ${light}"></span><span class="status" title="${status}">${status}</span>
<button class="tool" data-act="side" title="Snap to the other corner">⇄</button><button class="tool" data-act="collapse" title="Collapse">–</button></header>
<div class="body"><h2>${fmt(state.title)}</h2>${state.me ? `<p class="me">This window: ${esc(state.me)}</p>` : ''}${stepHtml}
${state.done ? '<p class="done">All steps checked. You can close the windows.</p>' : ''}</div>`;

        const area = panel.querySelector('textarea');

        if (area) {
            area.value = draft ?? '';
            area.focus();
        }

        place();
    }

    // --- The control window ---------------------------------------------------------------------

    // Line icons (Lucide shapes) instead of emoji, which some systems draw as colour pictures.
    const icon = (paths, size = 16, fill = 'none') =>
        `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const icons = {
        window: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 4v4"/><path d="M10 4v4"/>',
        say: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
        play: '<polygon points="6 3 20 12 6 21 6 3"/>',
        note: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
        auto: '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
        pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        cross: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    };

    // `label` without its leading icon ("▶ Next" → "Next"), for the button's own icon slot.
    const bare = (label) => String(label ?? '').replace(/^[^\p{L}\p{N}]+/u, '');

    // The result of the step before, as one line: green when it worked, red when it did not. `state.last`
    // is a line of text, or { mark, id, note } from a demo script's own check.
    function flash(list) {
        const last = state.last;

        if (!last) {
            return '';
        }

        if (typeof last === 'string') {
            return `<p class="flash plain">${fmt(last)}</p>`;
        }

        const ok = ['✅', '🟡', '✓'].includes(last.mark);
        const at = list.findIndex(({ s }) => s.id === last.id);
        const name = at >= 0 ? `${t('step')} ${at + 1}` : last.id;

        return `<p class="flash ${ok ? 'ok' : 'bad'}" role="status"><span class="ic">${ok ? '✓' : '✗'}</span><span><b>${esc(name)} ${esc(ok ? t('worked') : t('failed'))}</b>${last.note ? ` · ${fmt(last.note)}` : ''}</span></p>`;
    }

    function renderDocked() {
        // Keep what the person is typing across re-renders.
        const draft = panel.querySelector('textarea')?.value;
        const all = state.steps ?? [];
        const step = currentStep();
        // A step of kind "end" (a demo part's closing prompt) is not one of the steps.
        const list = all.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'end');
        const total = list.length;
        const at = list.findIndex(({ i }) => i === state.current);
        const ending = step?.kind === 'end' || state.done;
        const working = state.state === 'working' && !state.done;
        // A tour (open.mjs) asks ✓ / ✗ on every step; a demo only while it waits for a verdict.
        const verdict = state.confirming !== false && !ending;
        const auto = Boolean(state.auto);
        const failed = list.filter(({ i }) => state.results?.[i] === 'problem').length;
        const finished = list.filter(({ i }) => state.results?.[i]).length;
        const okLabel = state.okLabel ?? (verdict ? t('looksRight') : t('next'));
        const noLabel = state.problemLabel ?? t('problem');

        document.title = `${state.title ?? 'Tour'} · ${state.badge ?? 'Tour'}`;

        const bar = total
            ? `<div class="bar" aria-hidden="true">${list
                  .map(({ i }) => `<i class="${state.results?.[i] ?? (i === state.current && !ending ? 'cur' : '')}"></i>`)
                  .join('')}</div>
<p class="count"><span>${ending ? `${finished} ${esc(t('of'))} ${total}` : at >= 0 ? `${esc(t('step'))} ${at + 1} ${esc(t('of'))} ${total}` : ''}</span>${failed ? `<span class="bad">✗ ${failed}</span>` : ''}</p>`
            : '';

        const top = `<header class="top"><div class="over"><span class="brand"></span><span>${esc(state.overline ?? state.badge ?? 'Tour')}</span></div><h1>${fmt(state.title)}</h1>${bar}</header>`;

        let main;

        if (!step && !state.done) {
            main = `<p class="next">${esc(t('waiting'))}</p>`;
        } else if (ending) {
            main = `<section class="endcard${failed ? ' bad' : ''}"><p class="big"><span class="tick">${failed ? '!' : '✓'}</span>${esc(state.done ? t('allDone') : t('sceneDone'))}</p>
${!state.done && state.status ? `<p>${fmt(state.status)}</p>` : ''}
${!state.done && step?.do ? `<p class="then">${fmt(step.do)}</p>` : ''}</section>`;
        } else {
            const sayIt = Boolean(step.say);

            main = `<section class="now${working ? ' working' : ''}" aria-live="polite">
${step.window ? `<span class="where">${icon(icons.window, 14)}<span>${esc(step.window)}</span></span>` : ''}
<p class="do">${fmt(step.do)}</p>
${step.see ? `<div class="say${sayIt ? '' : ' expect'}"><p class="label">${sayIt ? `${icon(icons.say, 14)}${esc(t('say'))}` : `${icon(icons.check, 14)}${esc(t('expectLabel'))}`}</p><p>${fmt(step.see)}</p></div>` : ''}
${step.path ? `<button class="btn ghost open" data-act="open" title="${esc(step.path)}">${esc(t('goTo'))} <code>${esc(step.path)}</code></button>` : ''}
</section>`;
        }

        const steps = total
            ? `<section class="steps"><h2>${esc(t('stepsTitle'))}</h2><ol>${list
                  .map(({ s, i }, n) => {
                      const cls = `${i === state.current && !ending ? 'cur ' : ''}${state.results?.[i] ?? ''}`;
                      const mark = state.results?.[i] === 'ok' ? '✓' : state.results?.[i] === 'problem' ? '✗' : n + 1;
                      const inner = `<span class="n">${mark}</span><span>${esc(String(s.do ?? '').replace(/`/g, ''))}</span>`;

                      return state.noBack
                          ? `<li class="${cls}"><div>${inner}</div></li>`
                          : `<li class="${cls}"><button data-act="go" data-i="${i}">${inner}</button></li>`;
                  })
                  .join('')}</ol></section>`
            : '';

        let dock;

        if (ui.problem) {
            dock = `<form><p class="label">${esc(verdict ? t('verdictTitle') : t('noteTitle'))}</p>
<textarea rows="3" placeholder="${esc(state.problemPlaceholder ?? t('problemHint'))}"></textarea>
<div class="row"><button type="submit" class="btn save${verdict ? ' bad' : ''}">${esc(verdict ? t('sendVerdict') : t('send'))}</button><button type="button" class="btn ghost" data-act="cancel">${esc(t('cancel'))} <kbd>Esc</kbd></button></div>
<p class="hint">⌘ Enter / Ctrl Enter = ${esc(verdict ? t('sendVerdict') : t('send'))}</p></form>`;
        } else if (state.done) {
            dock = '';
        } else {
            // Your status line (the agent's, or what the big button does next). While a demo step runs,
            // the button itself says so; while a tour step is being looked at, the line says why.
            const quiet = auto || ending || /^ready$/i.test(state.status ?? '') || (working && !verdict);
            const line = quiet ? '' : `${working ? '<span class="spin"></span>' : ''}<span>${fmt(state.status ?? '')}</span>`;
            const busy = working || auto;
            const back = state.noBack
                ? ''
                : `<button class="btn back" data-act="back" title="${esc(t('back'))}" ${state.current === 0 ? 'disabled' : ''}>←</button>`;
            const buttons = verdict
                ? `<div class="row">${back}<button class="btn good" data-act="ok" ${working ? 'disabled' : ''}>${icon(icons.check, 18)}${esc(bare(okLabel))}</button><button class="btn no" data-act="problem" ${working ? 'disabled' : ''}>${icon(icons.cross, 18)}${esc(bare(noLabel))} <kbd>N</kbd></button></div>`
                : `<button class="btn primary" data-act="ok" ${busy ? 'disabled' : ''}>${busy ? '<span class="spin"></span>' : icon(icons.play, 18, 'currentColor')}<span class="txt">${esc(busy ? (auto ? t('autoRunning') : t('working')) : bare(okLabel))}</span>${busy ? '' : '<kbd>Enter</kbd>'}</button>
${ending ? '' : `<div class="row"><button class="btn ghost" data-act="problem">${icon(icons.note)}${esc(bare(noLabel))} <kbd>N</kbd></button>${state.canAuto ? `<button class="btn ghost${auto ? ' on' : ''}" data-act="auto" aria-pressed="${auto}">${auto ? `${icon(icons.pause, 16, 'currentColor')}${esc(t('autoOff'))}` : `${icon(icons.auto, 16, 'currentColor')}${esc(t('autoOn'))}`}</button>` : ''}</div>`}`;

            // The line stays (empty) while a step runs, so the big button never moves under the cursor.
            dock = `${ending ? '' : `<p class="next">${line}</p>`}${buttons}`;
        }

        panel.className = 'cw';
        panel.innerHTML = `${top}<div class="scroll">${ending ? '' : flash(list)}${main}${steps}</div>${dock ? `<footer class="dock">${dock}</footer>` : ''}`;

        const area = panel.querySelector('textarea');

        if (area) {
            area.value = draft ?? '';
            area.focus();
        }

        // Keep the current step in sight in a long list.
        panel.querySelector('.steps .cur')?.scrollIntoView({ block: 'nearest' });
    }

    // --- Dragging -------------------------------------------------------------------------------

    let drag = null;
    let dragged = false;

    // Puts the panel where it was dragged, kept fully on screen; without a position, CSS puts it in a corner.
    function place() {
        if (!panel || docked) {
            return;
        }

        if (!ui.pos) {
            panel.removeAttribute('style');

            return;
        }

        Object.assign(panel.style, {
            right: 'auto',
            bottom: 'auto',
            width: ui.collapsed
                ? 'auto'
                : `${Math.min(360, window.innerWidth - 16)}px`,
        });

        const rect = panel.getBoundingClientRect();
        const x = Math.min(
            Math.max(0, ui.pos.x),
            Math.max(0, window.innerWidth - rect.width),
        );
        const y = Math.min(
            Math.max(0, ui.pos.y),
            Math.max(0, window.innerHeight - rect.height),
        );

        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
    }

    function onPointerDown(event) {
        if (
            docked ||
            event.button !== 0 ||
            !event.target.closest('header, .pill') ||
            event.target.closest('.tool')
        ) {
            return;
        }

        const rect = panel.getBoundingClientRect();

        // No text selection while dragging.
        event.preventDefault();
        drag = {
            dx: event.clientX - rect.left,
            dy: event.clientY - rect.top,
            x: event.clientX,
            y: event.clientY,
        };
        dragged = false;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(event) {
        if (!drag) {
            return;
        }

        // A few pixels of jitter is still a click (on the pill: expand).
        if (
            !dragged &&
            Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4
        ) {
            return;
        }

        dragged = true;
        panel.classList.add('dragging');
        ui.pos = { x: event.clientX - drag.dx, y: event.clientY - drag.dy };
        place();
    }

    function onPointerUp() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        panel.classList.remove('dragging');
        drag = null;

        if (dragged) {
            // Remember the real (clamped) spot, so it comes back after a page load.
            const rect = panel.getBoundingClientRect();

            ui.pos = { x: rect.left, y: rect.top };
            saveUi();
        }

        // The click that follows a drag must not count (it would expand the pill).
        setTimeout(() => {
            dragged = false;
        }, 0);
    }

    function onDoubleClick(event) {
        if (event.target.closest('header') && !event.target.closest('.tool')) {
            ui.pos = null;
            saveUi();
            place();
        }
    }

    function send(event) {
        window.__tourSend?.(event);
    }

    function onClick(event) {
        const button = event.target.closest('[data-act]');

        if (!button || dragged) {
            return;
        }

        const act = button.dataset.act;

        if (act === 'collapse' || act === 'expand') {
            ui.collapsed = act === 'collapse';
            saveUi();
        } else if (act === 'side') {
            ui.side = ui.side === 'right' ? 'left' : 'right';
            ui.pos = null;
            saveUi();
        } else if (act === 'problem') {
            ui.problem = true;
        } else if (act === 'cancel') {
            ui.problem = false;
        } else if (act === 'auto') {
            // A demo's own words for it: a note "auto" plays the rest of the part, "pause" stops again.
            send({ type: 'problem', text: state.auto ? 'pause' : 'auto', step: state.current });
        } else if (act === 'ok') {
            ui.problem = false;
            // The step on screen goes along, so a double-click cannot confirm the next one too.
            send({ type: 'ok', step: state.current });

            // The control window answers at once; the script's next state follows.
            if (docked && !state.done && state.confirming === false) {
                state = { ...state, state: 'working' };
            }
        } else if (act === 'back') {
            send({ type: 'go', step: state.current - 1 });
        } else if (act === 'go') {
            send({ type: 'go', step: Number(button.dataset.i) });
        } else if (act === 'open') {
            if (docked) {
                // The control window asks the launcher to open the path in the step's own window.
                send({ type: 'open', step: state.current });
            } else {
                const url = target(currentStep().path);

                if (url) {
                    location.href = url.href;
                }
            }
        }

        render();
    }

    function onSubmit(event) {
        event.preventDefault();

        const text = panel.querySelector('textarea')?.value.trim();

        if (!text) {
            return;
        }

        ui.problem = false;
        render();
        send({ type: 'problem', text, step: state.current });
    }

    // --- Highlight the element the step talks about --------------------------------------------

    const norm = (text) =>
        String(text ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    const groups = [
        'button, a, [role=button], [role=tab], [role=menuitem], [role=link], [role=checkbox], summary, label, input[type=submit], input[type=button]',
        'h1, h2, h3, h4, th, td, li, dt, dd, strong, span, p',
        'div',
    ];
    let found = null;
    let foundKey = '';
    let scrolledFor = '';
    let lastLookup = 0;

    function visible(el) {
        const rect = el.getBoundingClientRect();

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(el).visibility !== 'hidden'
        );
    }

    function find(spec) {
        if (spec.startsWith('css=')) {
            return document.querySelector(spec.slice(4));
        }

        const wanted = norm(spec);

        for (const group of groups) {
            const hits = [...document.body.querySelectorAll(group)].filter(
                (el) => {
                    const text = norm(
                        el.innerText ||
                            el.value ||
                            el.getAttribute('aria-label'),
                    );

                    return text.includes(wanted) && visible(el);
                },
            );

            if (hits.length > 0) {
                const area = (el) => {
                    const r = el.getBoundingClientRect();

                    return r.width * r.height;
                };

                return hits.sort((a, b) => area(a) - area(b))[0];
            }
        }

        return null;
    }

    function track() {
        if (host && !host.isConnected && document.documentElement) {
            document.documentElement.appendChild(host);
        }

        theme();

        const step = currentStep();

        if (!ring || docked) {
            return;
        }

        if (!step?.highlight || !isMine(step) || !document.body) {
            ring.style.display = 'none';

            return;
        }

        const key = `${state.current}:${step.highlight}`;

        if (
            key !== foundKey ||
            !found?.isConnected ||
            Date.now() - lastLookup > 1500
        ) {
            found = find(step.highlight);
            foundKey = key;
            lastLookup = Date.now();
        }

        if (!found) {
            ring.style.display = 'none';

            return;
        }

        if (scrolledFor !== key) {
            scrolledFor = key;
            found.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        const r = found.getBoundingClientRect();

        Object.assign(ring.style, {
            display: 'block',
            top: `${r.top - 5}px`,
            left: `${r.left - 5}px`,
            width: `${r.width + 10}px`,
            height: `${r.height + 10}px`,
        });
    }

    // --- Wiring ---------------------------------------------------------------------------------

    // In the control window the keyboard drives the tour too: Enter or → is the main button (✓ on a
    // tour), ← goes back, N opens the ✗ / note form, Esc closes it, ⌘/Ctrl Enter sends it. A focused
    // button keeps its own Enter.
    if (docked) {
        window.addEventListener('keydown', (event) => {
            const el = event.composedPath()[0];

            if (!state || state.done) {
                return;
            }

            if (ui.problem) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    ui.problem = false;
                    render();
                } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    panel.querySelector('form')?.requestSubmit();
                }

                return;
            }

            if (
                event.altKey ||
                event.metaKey ||
                event.ctrlKey ||
                ['TEXTAREA', 'INPUT', 'BUTTON'].includes(el?.tagName) ||
                state.state === 'working'
            ) {
                return;
            }

            if ((event.key === 'n' || event.key === 'N') && currentStep()?.kind !== 'end') {
                event.preventDefault();
                ui.problem = true;
                render();
            } else if ((event.key === 'Enter' || event.key === 'ArrowRight') && !state.auto) {
                event.preventDefault();
                send({ type: 'ok', step: state.current });

                if (state.confirming === false) {
                    state = { ...state, state: 'working' };
                    render();
                }
            } else if (event.key === 'ArrowLeft' && state.current > 0 && !state.noBack) {
                event.preventDefault();
                send({ type: 'go', step: state.current - 1 });
            }
        });

        // Follow the system's light / dark switch while the window is open.
        window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', theme);
    }

    window.__tourRender = render;
    window.__tourHide = (hidden) => {
        if (host) {
            host.style.display = hidden ? 'none' : '';
        }
    };

    async function start() {
        for (let i = 0; i < 50 && typeof window.__tourGet !== 'function'; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        render(await window.__tourGet?.());
        setInterval(track, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => void start(), { once: true });
    } else {
        void start();
    }
})();
