// The guided demo engine (run-playbook's demo mode; guided-tour.md, next to this folder). Managed by
// /shipkit:forge.
//
// A part script (<shared>/playbooks/<stem>/part-<N>.mjs) drives the app the way a person would, in the
// tour browser (chrome.sh, next to this file): a control window at the right edge of the screen
// (tour-control.mjs) shows the step, whose window it happens in and what to expect; the app windows sit
// to its left, desktop-sized, with only a ring on the element the next step uses. Every step is two
// clicks for the person: "▶ Do it" runs the action, then "✓ Looks right" / "✗ Not right" records their
// verdict on the result. There is no "back": the script cannot undo a step. A note "auto" (✎ Note, or
// the "No stops" button) runs the rest of the part without stopping, "pause" stops again.
//
//   import { Demo, text } from '../../tour/demo.mjs';
//   const demo = new Demo({ playbook: 'story', title: 'Part 2 · An order', steps: [
//       { id: '2.1', do: 'Admin · opens `Orders`', see: 'the list, newest first', highlight: 'Orders' },
//       { id: 'end', do: 'Part 2 done' } ] });
//   await demo.run(async () => {
//       const { page } = await demo.window('Admin', { surface: 'app', login: 'qa-admin@example.test' });
//       await demo.go(page, '2.1', '/orders');
//       await demo.mark('2.1', (await text(page)).includes('Orders') ? '✅' : '❌', 'the list shows');
//       await demo.closePrompt('end', page, 'Part 2 done.', 'go on to Part 3');
//   });
//
// Events go to stdout, one JSON line each, for the agent to follow with Monitor:
//   {"type":"layout"|"waiting"|"step"|"look"|"confirm"|"verdict"|"problem"|"mode"|"vars"|"error"|"done"|"closed", "step": "3.2"}
// "step" is the script's own check of the step (mark ✅/❌/🟡), "verdict" the person's (✓/✗, with text and
// shot). "closed" (exit code 3): the person closed the control window, or the run was stopped (SIGTERM);
// the parts after it do not run. Shots are paths from the repo root.
//
// Environment: DEMO_WS (the workspace, default .claude/.tmp/qa-<stem>: sessions, vars.json, files/),
// DEMO_EV (the evidence folder, default <workspace>/evidence), DEMO_ACCOUNTS (the accounts file, default
// <workspace>/accounts.json), DEMO_SLOWMO (ms between browser actions, default 400), DEMO_DEVICES=1
// (phone and dark windows, and screenshots in both themes at 1440 + 360 px; a demo leaves them out by
// default), DEMO_REHEARSE=1 (✓ / ✗ after every step in "present" mode), DEMO_AUTO=1 (no stops, no
// verdicts) with TOUR_HEADLESS=1 (chrome.sh with no window): only to smoke-test a part script. TOUR_CDP
// and TOUR_PLAYWRIGHT as for open.mjs.
//
// What the viewer's eye follows in the app windows (a viewer may see only a shared app window, not the
// control window): a pointer that glides to every element the script clicks or types into, a ripple on
// each click and a glow on the field being filled (DEMO_POINTER=0 turns it off; =1 keeps it with
// TOUR_HEADLESS, for screenshots); the violet ring before a step on its `highlight` (what it uses); and
// an amber ring after it on its `look` (where its result shows), until the next step starts. Each look
// is reported as a "look" event with what it rings ("found", or null when it matches nothing);
// DEMO_LOOKSHOTS=1 also keeps <evidence>/<step>-look.jpg as the viewer sees it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { PHONE, ROOT, addRing, connect, openControl, placeWindow, renderRing } from './tour-control.mjs';
import { SIGNIN_HINT, address, readAccounts, readSurfaces, signIn, trim } from './surfaces.mjs';

const DEVICES = process.env.DEMO_DEVICES === '1';
const REHEARSE = process.env.DEMO_REHEARSE === '1';
const AUTO = process.env.DEMO_AUTO === '1';
const HEADLESS = process.env.TOUR_HEADLESS === '1';
const POINTER = process.env.DEMO_POINTER === '1' || (!HEADLESS && process.env.DEMO_POINTER !== '0');
const DESKTOP = { width: 1440, height: 900 };

// The words the engine puts in the control window. A part script can replace any of them (`text`), and
// the panel's own (`i18n`, tour-panel.js `words`), in the product's language (project.md §Language).
const TEXT = {
    next: 'Next:',
    ready: 'Next: the step below.',
    running: 'Running…',
    doIt: '▶ Do it',
    looksRight: '✓ Looks right',
    notRight: '✗ Not right',
    note: '✎ Note',
    expect: 'Expect:',
    check: 'Done. Check the window: does it look right?',
    notRightHint: 'What is not right? (a screenshot of the window is attached)',
    noteHint: 'A note for the run. "auto" runs the rest of the part without stopping, "pause" stops again.',
    noteSaved: 'Note recorded.',
    auto: 'Auto: running to the end of the part. A note "pause" stops it.',
    paused: 'Paused again.',
    actionFailed: 'the action failed',
};

// Links with a token (an approval, an invitation, a reset) are masked in everything the demo prints.
export function mask(value) {
    return (
        String(value)
            // A long random segment has digits or capitals; a folder name like "qa-story-flow" has neither.
            .replace(/\/([A-Za-z0-9_-]{24,})(?=[/?#"\s]|$)/g, (all, segment) =>
                /[A-Z0-9]/.test(segment) ? '/<token>' : all,
            )
            .replace(/([?&#](?:token|signature|code|expires|key)=)[^&#"\s]*/gi, '$1<masked>')
    );
}

export function out(event) {
    console.log(mask(JSON.stringify(event)));
}

export function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
}

// --- The pointer ----------------------------------------------------------------------------------

// Playwright clicks and types without moving anything the viewer can see. Every element action (a
// locator's or a page's click, fill, selectOption, …) goes through the Frame method of the same name, so
// one hook there covers every part script: before the action, the mouse glides to the element, and the
// app window draws it as a pointer (tour-panel.js). Only in the app windows, never the control window.
const ACTIONS = ['click', 'dblclick', 'tap', 'fill', 'type', 'press', 'check', 'uncheck', 'setChecked', 'selectOption', 'setInputFiles', 'hover'];
const shown = new WeakSet();
let hooked = false;

async function glide(frame, selector) {
    const page = frame.page();

    if (!page || page.isClosed() || !shown.has(page.context())) {
        return;
    }

    const target = frame.locator(selector).first();

    // Attached but hidden (a file input behind its label): no glide, and no waiting for it to show.
    await target.waitFor({ state: 'attached', timeout: 5000 });

    if (!(await target.isVisible())) {
        return;
    }

    await target.scrollIntoViewIfNeeded({ timeout: 2000 });

    const box = await target.boundingBox({ timeout: 2000 });

    if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
        await sleep(300);
    }
}

function hookPointer(page) {
    if (hooked || !POINTER) {
        return;
    }

    hooked = true;

    const proto = Object.getPrototypeOf(page.mainFrame());

    for (const name of ACTIONS) {
        const original = proto[name];

        if (typeof original !== 'function') {
            continue;
        }

        proto[name] = async function (selector, ...rest) {
            if (typeof selector === 'string') {
                // A pointer that cannot reach the element (hidden, not there yet) never stops the action.
                await glide(this, selector).catch(() => undefined);
            }

            return original.call(this, selector, ...rest);
        };
    }
}

// --- Page helpers ---------------------------------------------------------------------------------

export const text = (page) => page.evaluate(() => document.body.innerText);

// True when the page scrolls sideways (a layout that does not fit).
export const sideways = (page) =>
    page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

// Collects JS errors and responses >= 400 of a page into `problems`.
export function track(page, problems = []) {
    page.on('pageerror', (error) => problems.push(`JS ${page.url()}: ${error.message}`));
    page.on('response', (response) => {
        if (response.status() >= 400 && !response.url().includes('/favicon')) {
            problems.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
    });

    return problems;
}

// The address of the link whose text contains `label` in an HTML body (a mail from the mail catcher:
// project.md §Dev stack says how to read it). Never print or write it down.
export function linkIn(html, label) {
    const links = [...String(html ?? '').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(
        ([, href, inner]) => ({
            href: href.replace(/&amp;/g, '&'),
            text: inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        }),
    );
    const link = links.find((candidate) => candidate.text.includes(label));

    if (!link) {
        throw new Error(`no link "${label}" in the message`);
    }

    return link.href;
}

// --- The demo -------------------------------------------------------------------------------------

export class Demo {
    // `playbook`: the playbook's file stem (the workspace is run-playbook's, .claude/.tmp/qa-<stem>/).
    // `steps`: [{ id, do, see?, say?, highlight?, look? }]: `see` is what to expect, `say` a line for the
    // person presenting, `highlight` the element the step uses (ringed before it runs), `look` where its
    // result shows (ringed after it ran, until the next step starts): visible text, `css=<selector>`, or
    // a {VAR} the parts saved (`{ORDER_CODE}`). `mode`: "check" (default) asks ✓ / ✗ after every step; "present" is one click per
    // step, the checks run silently and only a failure shows (DEMO_REHEARSE=1 brings ✓ / ✗ back).
    // `text` / `i18n`: the words, in the product's language.
    constructor({ playbook, title, steps, mode = 'check', text: words = {}, i18n = null, badge = 'Demo' }) {
        const at = (path) => (isAbsolute(path) ? path : resolve(ROOT, path));

        this.ws = at(process.env.DEMO_WS ?? join('.claude/.tmp', `qa-${playbook}`));
        this.ev = at(process.env.DEMO_EV ?? join(this.ws, 'evidence'));
        this.files = join(this.ws, 'files');
        this.accountsFile = at(process.env.DEMO_ACCOUNTS ?? join(this.ws, 'accounts.json'));
        mkdirSync(this.ev, { recursive: true });
        mkdirSync(this.files, { recursive: true });
        this.text = { ...TEXT, ...words };
        this.i18n = i18n;
        this.badge = badge;
        this.confirm = mode === 'check' || REHEARSE;
        this.title = title;
        this.overline = null;
        this.steps = steps;
        this.current = 0;
        this.results = {};
        this.done = false;
        this.status = 'Ready';
        this.state = 'ready';
        this.windows = [];
        this.stepWindow = {};
        this.waiter = null;
        this.auto = AUTO;
        this.confirming = false;
        this.okLabel = null;
        this.last = null;
        // The result of the step that just ran: { window, spec }, ringed until the next step starts.
        this.look = null;
        this.notes = [];
        this.marks = {};
        this.verdicts = {};
        this.browser = null;
        this.control = null;
        this.ending = false;
        this.failed = new Set();
        this.surfaces = readSurfaces();
        this.accounts = null;
    }

    // A path from the repo root, for the events (never the home directory).
    rel(file) {
        return relative(ROOT, file);
    }

    // Connects to the tour browser and opens the control window.
    async start() {
        ({ browser: this.browser } = await connect({ slowMo: Number(process.env.DEMO_SLOWMO ?? 400) }));
        this.control = await openControl(this.browser, {
            getState: () => this.payload(null),
            onEvent: (event) => this.onEvent(event),
        });
        out({ type: 'layout', ...this.control.layout, area: this.control.area });

        // Closing the control window, or the browser, ends the run: nobody is left to press the buttons.
        this.control.page.on('close', () => void this.quit('control window closed'));
        this.browser.on('disconnected', () => void this.quit('browser closed'));

        for (const signal of ['SIGINT', 'SIGTERM']) {
            process.on(signal, () => void this.quit('stopped'));
        }
    }

    // Plays `fn` between start() and end(). An error out of a part script is reported, never left with
    // windows open in the host's browser.
    async run(fn) {
        try {
            await this.start();
            await fn(this);
        } catch (error) {
            out({
                type: 'error',
                step: this.control ? (this.steps[this.current]?.id ?? null) : null,
                message: String(error.message).replace(/\s*\n\s*/g, ' · '),
                fatal: true,
            });
            process.exitCode = 1;
        } finally {
            await this.end();
        }
    }

    // Closes this run's windows and the control window. Connected over the DevTools port, the browser
    // itself keeps running (chrome.sh stop quits it).
    async end() {
        this.ending = true;

        for (const w of this.windows) {
            await w.ctx.close().catch(() => undefined);
        }

        this.windows = [];
        await this.control?.close();
        await this.browser?.close().catch(() => undefined);
    }

    async quit(reason) {
        if (this.ending) {
            return;
        }

        out({ type: 'closed', reason });
        await this.end();
        process.exit(3);
    }

    // Several scenes in one browser: each brings its own title and steps, the windows stay open. `end` is
    // the prompt that leads to the next one. `overline` is the small line above the title.
    scene({ title, steps, end, overline = null }) {
        this.title = title;
        this.overline = overline;
        this.steps = [...steps, { id: 'end', do: end, kind: 'end' }];
        this.current = 0;
        this.results = {};
        this.stepWindow = {};
        this.last = null;
        this.done = false;
        this.ending = false;
    }

    // Values that later parts need (ids and codes only, never links or passwords), kept in <ws>/vars.json.
    vars() {
        const file = join(this.ws, 'vars.json');

        return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    }

    saveVars(values) {
        const all = { ...this.vars(), ...values };

        writeFileSync(join(this.ws, 'vars.json'), JSON.stringify(all, null, 2));
        out({ type: 'vars', ...values });

        return all;
    }

    payload(me) {
        return {
            badge: this.badge,
            title: this.title,
            pointer: POINTER,
            look: this.look,
            overline: this.overline ?? null,
            status: this.status,
            state: this.state,
            last: this.last,
            okLabel: this.okLabel ?? (this.confirming ? this.text.looksRight : this.text.doIt),
            problemLabel: this.confirming ? this.text.notRight : this.text.note,
            problemPlaceholder: this.confirming ? this.text.notRightHint : this.text.noteHint,
            // The control window shows ✓ / ✗ while it waits for a verdict, otherwise one button and a note.
            confirming: this.confirming,
            auto: this.auto,
            canAuto: !AUTO,
            i18n: this.i18n,
            // The script cannot undo a step: no ← and no jumping in the list.
            noBack: true,
            steps: this.steps.map((s) => ({
                id: s.id,
                // The closing prompt of a scene or a part (the step "end") is not one of its steps.
                kind: s.kind ?? (s.id === 'end' ? 'end' : 'step'),
                do: s.do,
                see: s.say ?? s.see,
                say: Boolean(s.say),
                highlight: s.highlight,
                window: this.stepWindow[s.id],
            })),
            current: this.current,
            results: this.results,
            done: this.done,
            me,
        };
    }

    entryOf(page) {
        return this.windows.find((w) => w.ctx === page?.context());
    }

    release(value) {
        const resolveWaiter = this.waiter;

        this.waiter = null;
        resolveWaiter?.(value);
    }

    onEvent(event) {
        const note = String(event.text ?? '').trim();

        if (event.type === 'ok' && event.step === this.current) {
            this.release();
        } else if (event.type === 'problem' && /^(auto|pause)$/i.test(note)) {
            this.auto = note.toLowerCase() === 'auto';
            out({ type: 'mode', auto: this.auto });
            this.status = this.auto ? this.text.auto : this.text.paused;
            void this.render();

            if (this.auto) {
                this.release();
            }
        } else if (event.type === 'problem' && this.confirming) {
            // "✗ Not right" after an action: the person's verdict on the step.
            this.release({ verdict: 'problem', text: note.slice(0, 2000) });
        } else if (event.type === 'problem') {
            const entry = { step: this.steps[this.current]?.id, text: note };

            this.notes.push(entry);
            out({ type: 'problem', ...entry });
            this.status = this.text.noteSaved;
            void this.render();
        } else {
            // "go", "back", "open": the script drives every page; nothing to undo or jump to.
            void this.render();
        }
    }

    async render() {
        await this.control?.render(this.payload(null));

        for (const w of this.windows) {
            await renderRing(w.ctx, this.payload(w.name));
        }
    }

    async front(page) {
        if (page) {
            await page.bringToFront().catch(() => undefined);
        }

        // The keyboard stays in the control window (Enter = the button).
        await this.control?.page.bringToFront().catch(() => undefined);
    }

    // Shows step `id` with `status` as the "Next: …" line, rings its element in `page`, waits for the click.
    // `page` can also be a window that is not on screen yet, `{ window: '<its name>', open: () => page }`:
    // the windows on screen stay as they are (the result of the step before) until the click, and only
    // then is it opened. Returns the step's page.
    async wait(id, status, page = null, label = null) {
        const later = typeof page?.open === 'function' ? page : null;

        this.current = this.steps.findIndex((step) => step.id === id);

        if (page) {
            this.stepWindow[id] = later ? later.window : this.entryOf(page)?.name;
        }

        this.okLabel = label;
        this.status = status ?? this.text.ready;
        this.state = 'ready';
        await this.front(later ? null : page);
        await this.render();
        out({ type: 'waiting', step: id, status: this.status });

        if (this.auto) {
            await sleep(AUTO ? 200 : 1500);
        } else {
            await new Promise((done) => (this.waiter = done));
        }

        this.state = 'working';
        this.status = this.text.running;
        this.look = null;
        await this.render();

        if (later) {
            page = await later.open();
            await this.render();
        }

        return page;
    }

    // Shows the step, waits for "▶ Do it", then opens `path` (on the window's own site, or a whole address)
    // in that window. Returns the step's page.
    async go(page, id, path, what = null) {
        const target = await this.wait(id, `${this.text.next} ${what ?? path}.`, page);
        const origin = this.entryOf(target)?.origin ?? '';

        await this.act(target, async () => {
            await target.goto(address(origin, path), { waitUntil: 'load' });
            // A page that keeps loading data after "load" settles first; one that never goes quiet still works.
            await target.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
        });

        return target;
    }

    // Runs an action in `page`. A failure does not stop the demo: it is recorded with a screenshot, the URL
    // and the top of the page, and the step's own check then marks it ❌.
    async act(page, fn) {
        await page.bringToFront().catch(() => undefined);

        try {
            return await fn();
        } catch (error) {
            const id = this.steps[this.current]?.id ?? 'step';
            const message = String(error.message).split('\n')[0];
            const shot = await this.snap(page, `${id}-error`, { full: false }).catch(() => null);
            const head = await page.evaluate(() => document.body?.innerText.slice(0, 400)).catch(() => '');

            this.failed.add(id);
            out({ type: 'error', step: id, url: page.url(), message, shot, head });
            this.status = `❌ ${id}: ${message}`.slice(0, 200);
            await this.render();

            return undefined;
        } finally {
            await this.control?.page.bringToFront().catch(() => undefined);
        }
    }

    // Records the script's check of step `id`, then waits for the person's verdict (✓ / ✗).
    async mark(id, mark, note, { confirm = true } = {}) {
        const index = this.steps.findIndex((step) => step.id === id);

        this.current = index;

        // A step whose action failed is ❌, whatever its check found on the page.
        if (this.failed.has(id) && mark !== '❌') {
            mark = '❌';
            note = `${note} (${this.text.actionFailed})`;
        }

        this.results[index] = mark === '✅' || mark === '🟡' ? 'ok' : 'problem';

        // Where the result shows, ringed until the next step starts (not on a step that failed). A {VAR}
        // in it takes the value the parts saved (vars.json).
        const vars = this.vars();
        const look = this.steps[index]?.look?.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (all, key) => (key in vars ? String(vars[key]) : all));

        this.look = look && mark !== '❌' && !/\{[A-Z][A-Z0-9_]*\}/.test(look) ? { window: this.stepWindow[id], spec: look } : null;

        if (this.look) {
            await this.checkLook(id);
        }

        this.marks[id] = { mark, note };
        // The control window shows it as "the step before": its mark, its number, what the check found.
        this.last = { mark, id, note: String(note).slice(0, 220) };
        out({ type: 'step', step: id, mark, note });

        if (!confirm || !this.confirm || this.auto) {
            this.status = `${mark} ${id}: ${note}`.slice(0, 220);
            await this.render();

            return;
        }

        const page = this.windows.find((w) => w.name === this.stepWindow[id])?.ctx.pages().at(-1);

        this.confirming = true;
        this.okLabel = null;
        this.status = this.text.check;
        this.state = 'ready';
        await this.front(page);
        await this.render();
        out({ type: 'confirm', step: id });

        const answer = (await new Promise((done) => (this.waiter = done))) ?? { verdict: 'ok' };

        this.confirming = false;

        if (answer.verdict === 'problem') {
            const shot = page ? await this.snap(page, `${id}-not-right`, { full: false }).catch(() => null) : null;

            this.results[index] = 'problem';
            this.verdicts[id] = { verdict: '✗', text: answer.text, shot };
            this.last = { mark: '✗', id, note: String(answer.text).slice(0, 220) };
        } else {
            this.verdicts[id] = { verdict: '✓' };
        }

        out({ type: 'verdict', step: id, ...this.verdicts[id] });
        this.state = 'working';
        this.status = this.text.running;
        await this.render();
    }

    // The last prompt of a part always waits (auto mode too, unless DEMO_AUTO): "▶ Go on to Part N" or
    // "▶ Close the windows".
    async closePrompt(id, page, message, next = 'close the windows') {
        if (!AUTO) {
            this.auto = false;
            await this.wait(id, message, page, `▶ ${next[0].toUpperCase()}${next.slice(1)}`);
        }

        // The part script ends next: that is the normal end, not a quit.
        this.ending = true;
        out({ type: 'done', marks: this.marks, verdicts: this.verdicts, notes: this.notes });
    }

    // --- Windows ------------------------------------------------------------------------------------

    stateFile(login, origin) {
        return join(this.ws, `state-${`${login}@${new URL(origin).host}`.replace(/[^a-z0-9]+/gi, '-')}.json`);
    }

    // An app window, `name` as the control window shows it. `surface` and `login` sign it in the way
    // surfaces.json says, with the password from the accounts file; the session is kept in the
    // workspace for the next parts. No login: a signed-out window (a visitor, a public page, a link from a
    // mail). `base` overrides the surface's address. `mobile` and `dark` only with DEMO_DEVICES=1.
    async window(name, { surface: surfaceName, login, base, mobile = false, dark = false } = {}) {
        const surface = surfaceName ? this.surfaces[surfaceName] : null;

        if (surfaceName && !surface) {
            throw new Error(`no surface "${surfaceName}" in surfaces.json`);
        }

        const origin = trim(base ?? surface?.base ?? '');
        const phone = mobile && DEVICES;
        const file = login ? this.stateFile(login, origin) : null;
        const ctx = await this.browser.newContext({
            viewport: phone ? PHONE.viewport : null,
            ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
            colorScheme: dark && DEVICES ? 'dark' : 'light',
            ...(file && existsSync(file) ? { storageState: file } : {}),
        });

        await addRing(ctx, () => this.payload(name));
        shown.add(ctx);
        this.windows.push({ ctx, name, mobile: phone, origin });

        const page = await ctx.newPage();

        hookPointer(page);

        await placeWindow(page, this.control.area, { mobile: phone, phones: DEVICES && this.windows.some((w) => w.mobile) });

        if (login) {
            await this.signedIn(page, { surface, origin, login, file, name });
        }

        return { ctx, page };
    }

    async signedIn(page, { surface, origin, login, file, name }) {
        if (!surface?.signin && !surface?.module) {
            throw new Error(`[${name}] a login needs a surface with "signin" or "module" in surfaces.json`);
        }

        // A kept session still holds when the start page does not send it back to the sign-in form.
        if (existsSync(file) && surface.signin) {
            await page.goto(`${origin}/`, { waitUntil: 'load' }).catch(() => undefined);

            if (!new URL(page.url()).pathname.startsWith(surface.signin.leaves ?? surface.signin.path)) {
                return;
            }
        }

        this.accounts ??= readAccounts(this.accountsFile);

        const password = this.accounts[login];

        if (!password) {
            throw new Error(`[${name}] no password for ${login} in the accounts file`);
        }

        try {
            await signIn(page, { surface, origin, login, password });
        } catch (error) {
            throw new Error(`[${name}] sign-in failed: ${error.message.split('\n')[0]}. ${SIGNIN_HINT}`);
        }

        await page.context().storageState({ path: file });
    }

    async closeWindow(ctx) {
        this.windows = this.windows.filter((w) => w.ctx !== ctx);
        await ctx.close();
    }

    // Opens a file the app serves as a download (a PDF) in the window, as a person would see it: that one
    // address is answered inline. A headless browser has no PDF viewer: it only fetches it.
    async showPdf(page, path) {
        const url = address(this.entryOf(page)?.origin ?? '', path);

        await page.context().route(url, async (route) => {
            const response = await route.fetch();

            await route.fulfill({ response, headers: { ...response.headers(), 'content-disposition': 'inline' } });
        });

        return HEADLESS ? page.request.get(url) : page.goto(url);
    }

    // Whether the step's `look` names something on the page: a "look" event, so the writer of a part
    // script sees a look that rings nothing (DEMO_AUTO runs show it too).
    async checkLook(id) {
        const page = this.windows.find((w) => w.name === this.look.window)?.ctx.pages().at(-1) ?? this.windows.at(-1)?.ctx.pages().at(-1);

        if (!page) {
            return;
        }

        await this.render();

        const found = await page.evaluate((spec) => window.__tourFind?.(spec) ?? null, this.look.spec).catch(() => null);

        out({ type: 'look', step: id, spec: this.look.spec, found });

        if (process.env.DEMO_LOOKSHOTS === '1') {
            await sleep(700);
            await page.screenshot({ path: join(this.ev, `${id}-look.jpg`), type: 'jpeg', quality: 70 }).catch(() => undefined);
        }
    }

    // --- Evidence -----------------------------------------------------------------------------------

    async hide(page, hidden) {
        await page.evaluate((h) => window.__tourHide?.(h), hidden).catch(() => undefined);
    }

    // A screenshot in <evidence>/<name>.jpg, without the ring. Returns its path from the repo root.
    async snap(page, name, { full = true } = {}) {
        const file = join(this.ev, `${name}.jpg`);

        await this.hide(page, true);
        await page.screenshot({ path: file, type: 'jpeg', quality: 80, fullPage: full });
        await this.hide(page, false);

        return this.rel(file);
    }

    // One screenshot of what is on screen (<name>-desktop). With DEMO_DEVICES=1: light and dark at
    // 1440 + 360 px (<name>-<light|dark>-<1440|360>), the way run-playbook names its evidence.
    async visualSet(page, name, { full = true } = {}) {
        const res = { files: [], sideways: {} };

        if (!DEVICES) {
            const tag = `${name}-desktop`;

            res.files.push(await this.snap(page, tag, { full }));
            res.sideways[tag] = await sideways(page);

            return res;
        }

        const own =
            page.viewportSize() ?? (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })));

        for (const viewport of [DESKTOP, PHONE.viewport]) {
            for (const scheme of ['light', 'dark']) {
                const tag = `${name}-${scheme}-${viewport.width === DESKTOP.width ? 1440 : 360}`;

                await page.setViewportSize(viewport);
                await page.emulateMedia({ colorScheme: scheme });
                await sleep(400);
                res.files.push(await this.snap(page, tag, { full }));
                res.sideways[tag] = await sideways(page);
            }
        }

        await page.setViewportSize(own);
        await page.emulateMedia({ colorScheme: 'light' });

        return res;
    }
}
