// The guided-tour panel, injected by `open.mjs --tour` (next to this file) into every page of a
// tour window (guided-tour.md, next to this folder). It lives in a shadow root on <html>, outside
// <body>, so it neither inherits the page's styles nor shows up in the page text. It goes on every
// surface the project has (an app, a public site, a mail catcher), so it carries
// its own palette, light or dark like the page (`data-theme` on <html>, else the system's), and its
// violet accent keeps it apart from the app's UI. Its stylesheet is a constructed one: a page's CSP
// (`style-src` without 'unsafe-inline') does not block it. State comes from the Node side
// (window.__tourGet / __tourRender); the person's answers go back through window.__tourSend.
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

            sheet.replaceSync(css);
            root.adoptedStyleSheets = [sheet];
            root.innerHTML = '<div class="ring"></div><section class="panel"></section>';
            ring = root.querySelector('.ring');
            panel = root.querySelector('.panel');
            panel.addEventListener('click', onClick);
            panel.addEventListener('submit', onSubmit);
            panel.addEventListener('pointerdown', onPointerDown);
            panel.addEventListener('dblclick', onDoubleClick);
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

    // --- Dragging -------------------------------------------------------------------------------

    let drag = null;
    let dragged = false;

    // Puts the panel where it was dragged, kept fully on screen; without a position, CSS puts it in a corner.
    function place() {
        if (!panel) {
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
        } else if (act === 'ok') {
            ui.problem = false;
            // The step on screen goes along, so a double-click cannot confirm the next one too.
            send({ type: 'ok', step: state.current });
        } else if (act === 'back') {
            send({ type: 'go', step: state.current - 1 });
        } else if (act === 'go') {
            send({ type: 'go', step: Number(button.dataset.i) });
        } else if (act === 'open') {
            const url = target(currentStep().path);

            if (url) {
                location.href = url.href;
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

        if (!ring) {
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
