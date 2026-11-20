#!/usr/bin/env node
// Opens visible browser windows, already signed in, on the pages a person should look at: the guided
// tour (guided-tour.md, next to this folder). Managed by /shipkit:forge.
//
// It drives a Chromium-family browser over its DevTools port. Start that browser first, on the host:
// chrome.sh (next to this file). Pages load in the host's browser, so every address is the host's
// (http://localhost:<port>/…), never a container name. Run this script on the host, or in a container
// that reaches the host (the default DevTools address there is host.docker.internal:9222).
//
//   node <this folder>/open.mjs --tour .claude/.tmp/qa-11/tour/part-3.json
//   node <this folder>/open.mjs --surface app --login qa11@example.test --accounts <file> /settings
//   node <this folder>/open.mjs --surface app --login qa11@example.test --accounts <file> --mobile /inbox
//   node <this folder>/open.mjs http://localhost:3000/pricing
//
// Surfaces (the project's sign-in recipes) come from surfaces.json next to this file (or --surfaces);
// surfaces.mjs says their shape.
//
// Options: --surface <name>, --login <id> (an account of that surface), --accounts <file> (JSON
//          {"<login>": "<password>"}: passwords live only in that git-ignored file, never in a tour file
//          or on a command line), --base <url>, --mobile (360x740, touch), --dark, --name <window label>,
//          --surfaces <file>, --cdp <url> (default TOUR_CDP, else http://host.docker.internal:9222 in a
//          container, http://127.0.0.1:9222 on the host), --playwright <dir> (where @playwright/test or
//          playwright resolves; default TOUR_PLAYWRIGHT, then the current directory, then the repo root),
//          --panel docked|overlay (a tour's panel, below).
// Every argument without "--" is a path, opened in its own tab: relative to the base, or a whole
// http(s) address (a page with no account). The script stays up until the person closes the windows,
// and prints JS errors and responses >= 400 as they happen. Run it in the background.
//
// --tour <file.json> opens one window per entry of its "windows" (each: name, surface, login, base,
// paths, mobile, dark) and a control window with the tour panel (tour-panel.js), docked at the right
// edge of the screen (tour-control.mjs). The app windows fill the space to its left and show only a
// ring around the element the current step names; the step's window comes forward when the step moves.
// --panel overlay puts the panel on every app page instead (one small screen). The file is watched:
// edit "status", "state", "steps" or "current" and the panel and the rings update. The person's answers
// are appended to <file>.log, one JSON line each:
// {"type":"ok"|"problem"|"go"|"done"|"ready"|"closed"|"error", "step": <1-based>, "window", "text", "url", "shot"}.
// Closing the control window ends the tour, like closing every app window.
import { appendFileSync, readFileSync, watchFile } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { HERE, PHONE, addRing, connect, defaultCdp, openControl, placeWindow, setBounds } from './tour-control.mjs';
import { SIGNIN_HINT, address, isUrl, readAccounts, readSurfaces, signIn, trim } from './surfaces.mjs';

// --- Arguments ----------------------------------------------------------------------------------

const flags = new Set(['--mobile', '--dark']);
const values = new Map();
const paths = [];
const argv = process.argv.slice(2);

for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (flags.has(arg)) {
        values.set(arg, true);
    } else if (arg.startsWith('--')) {
        values.set(arg, argv[++i]);
    } else {
        paths.push(arg);
    }
}

function fail(line) {
    console.error(`problem: ${line}`);
    process.exit(1);
}

const tourFile = values.get('--tour');
// The panel in its own control window (default), or floating on every app page (--panel overlay).
const docked = Boolean(tourFile) && values.get('--panel') !== 'overlay';
const tourStem = tourFile?.replace(/\.json$/, '');
const logFile = `${tourStem}.log`;
const cdp = values.get('--cdp') ?? defaultCdp();

function readTour() {
    return JSON.parse(readFileSync(tourFile, 'utf8'));
}

let surfaces = {};

try {
    surfaces = readSurfaces(values.get('--surfaces') ?? join(HERE, 'surfaces.json'));
} catch (error) {
    fail(error.message);
}

let tour = tourFile ? readTour() : null;
const windows = tour?.windows?.length
    ? tour.windows
    : [
          {
              name: values.get('--name'),
              surface: values.get('--surface'),
              login: values.get('--login'),
              base: values.get('--base'),
              mobile: values.get('--mobile'),
              dark: values.get('--dark'),
              paths,
          },
      ];
const accountsFile = tour?.accounts ?? values.get('--accounts');
const shotsDir = tour?.shots ?? (tourFile ? dirname(tourFile) : '.');

const surfaceOf = (win) => (win.surface ? surfaces[win.surface] : undefined);
const originOf = (win) => trim(win.base ?? surfaceOf(win)?.base ?? '');

const bad = windows.find(
    (win) =>
        !win.paths?.length ||
        (win.surface && !surfaceOf(win)) ||
        (win.login && !surfaceOf(win)?.signin && !surfaceOf(win)?.module) ||
        (!originOf(win) && !win.paths.every(isUrl)),
);

if (bad) {
    fail(
        `window ${JSON.stringify(bad.name ?? bad.surface ?? '')} is incomplete.\n` +
            'Usage: node open.mjs [--surface <name> --login <id> --accounts <file>] [--mobile] [--dark] [--base <url>] <path or url>...\n' +
            '       node open.mjs --tour <file.json> [--panel overlay]\n' +
            'Every window needs "paths"; a "surface" must be in surfaces.json; a "login" needs a surface with "signin" or "module"; ' +
            'a window without a surface needs a "base" or whole http(s) addresses.',
    );
}

let accounts = {};

if (windows.some((win) => win.login)) {
    try {
        accounts = readAccounts(accountsFile);
    } catch (error) {
        fail(error.message);
    }
}

// The password never leaves this process: not printed, not logged.
function password(id) {
    const value = accounts[id];

    if (!value) {
        throw new Error(`no password for ${id} in the accounts file`);
    }

    return value;
}

// --- Tour state, shared by every window -------------------------------------------------------

let current = Math.max(0, (tour?.current ?? 1) - 1);
let lastFileCurrent = tour?.current;
let done = false;
const results = {};
const opened = [];
// The control window, when the panel is docked (set once the browser is up).
let control = null;

function log(event) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event });

    if (tourFile) {
        appendFileSync(logFile, `${line}\n`);
    }

    console.log(`event: ${line}`);
}

function payload(win) {
    return {
        title: tour.title ?? 'Tour',
        status: tour.status ?? 'Ready',
        state: tour.state ?? 'ready',
        steps: tour.steps ?? [],
        current,
        results,
        done,
        me: win?.name ?? null,
        // Optional words of the control window, in the product's language (tour-panel.js `words`).
        i18n: tour.i18n ?? null,
    };
}

async function broadcast() {
    await control?.render(payload(null));

    for (const { win, context } of opened) {
        for (const page of context.pages()) {
            await page.evaluate((state) => window.__tourRender?.(state), payload(win)).catch(() => undefined);
        }
    }
}

function clamp(step) {
    const last = Math.max(0, (tour.steps?.length ?? 1) - 1);

    return Math.min(Math.max(0, step), last);
}

// The window a step happens in (its "window", else the first one) and the page in front there.
function stepWindow(index) {
    const name = tour.steps?.[index]?.window;

    return opened.find(({ win }) => win.name === name) ?? opened[0] ?? null;
}

function frontPage(entry) {
    const pages = entry?.context.pages() ?? [];

    return pages[pages.length - 1] ?? null;
}

// Brings the current step's window forward, then gives the keyboard back to the control window.
async function showStepWindow() {
    if (!control || opened.length < 2) {
        return;
    }

    await frontPage(stepWindow(current))?.bringToFront().catch(() => undefined);
    await control.page.bringToFront().catch(() => undefined);
}

async function answer(win, page, event) {
    // From the control window: the answer is about the current step's window.
    if (!win) {
        const about = ['problem', 'go'].includes(event.type) && event.step !== undefined ? clamp(event.step) : current;
        const entry = stepWindow(about);

        win = entry?.win ?? {};
        page = frontPage(entry);
    }

    // A confirmation of a step that is no longer current (a double-click), or after the end, is dropped.
    if (event.type === 'ok' && (done || (event.step !== undefined && event.step !== current))) {
        return;
    }

    if (event.type === 'problem' && event.step !== undefined) {
        current = clamp(event.step);
    }

    const step = current + 1;

    if (event.type === 'go') {
        current = clamp(event.step);
        log({ type: 'go', step: current + 1, window: win.name });
    } else if (event.type === 'ok') {
        results[current] = 'ok';
        log({ type: 'ok', step, window: win.name, url: page?.url() });

        if (current < (tour.steps?.length ?? 0) - 1) {
            current += 1;
        } else {
            done = true;
            log({ type: 'done', allOk: Object.values(results).every((r) => r === 'ok') });
        }
    } else if (event.type === 'problem') {
        results[current] = 'problem';

        const slug = (win.name ?? 'window').replace(/[^a-z0-9]+/gi, '-');
        const shot = join(shotsDir, `${basename(tourStem)}-step${step}-${slug}.jpg`);
        let shotTaken = false;

        // The screenshot shows the app as the person sees it, without the panel or the ring.
        if (page) {
            await page.evaluate(() => window.__tourHide?.(true)).catch(() => undefined);
            shotTaken = await page
                .screenshot({ path: shot, type: 'jpeg', quality: 80 })
                .then(() => true)
                .catch(() => false);
            await page.evaluate(() => window.__tourHide?.(false)).catch(() => undefined);
        }

        log({
            type: 'problem',
            step,
            window: win.name,
            text: String(event.text ?? '').slice(0, 2000),
            url: page?.url(),
            shot: shotTaken ? shot : undefined,
        });
    } else if (event.type === 'open') {
        // "Go to <path>" in the control window opens the path in the step's own window.
        const path = tour.steps?.[current]?.path;
        const origin = originOf(win);

        if (page && path && (origin || isUrl(path))) {
            await page.goto(address(origin, path)).catch((error) => report(`problem: ${path}: ${error.message.split('\n')[0]}`));
            await page.bringToFront().catch(() => undefined);
            await control?.page.bringToFront().catch(() => undefined);
        }
    }

    await broadcast();

    if (event.type === 'ok' || event.type === 'go') {
        await showStepWindow();
    }
}

if (tourFile) {
    // The agent edits the file while the tour runs (a polled stat: it also works through a bind mount).
    watchFile(tourFile, { interval: 400 }, async () => {
        try {
            tour = readTour();
        } catch {
            // A half-written file: the next change brings a whole one.
            return;
        }

        const before = current;

        if (tour.current !== undefined && tour.current !== lastFileCurrent) {
            current = clamp(tour.current - 1);
            delete results[current];
            done = false;
        }

        lastFileCurrent = tour.current;
        current = clamp(current);
        await broadcast();

        if (current !== before) {
            await showStepWindow();
        }
    });
}

// --- The host's browser -------------------------------------------------------------------------

let browser;
let screenBox;

try {
    ({ browser, screen: screenBox } = await connect({ cdp, playwright: values.get('--playwright') }));
} catch (error) {
    const reason = error.message.split('\n')[0];

    console.error(`problem: ${error.message}`);

    if (tourFile && error.noBrowser) {
        log({ type: 'error', text: reason });
    }

    process.exit(1);
}

screenBox ??= { left: 0, top: 0, width: 1440, height: 900 };

const seen = new Set();

function report(line) {
    if (!seen.has(line)) {
        seen.add(line);
        console.log(line);
    }
}

// Without a control window (--panel overlay, or no tour): desktop windows cascade from the left, phone
// windows stack on the right.
const anyPhone = windows.some((win) => win.mobile);
let desktops = 0;
let phones = 0;

async function cascade(page, mobile) {
    const step = 36;
    const width = mobile ? PHONE.window.width : Math.min(1280, screenBox.width - (anyPhone ? 440 : 0));
    const height = Math.min(mobile ? PHONE.window.height : 900, screenBox.height);
    const index = mobile ? phones++ : desktops++;
    const left = mobile ? screenBox.left + screenBox.width - width - index * step : screenBox.left + index * step;
    const top = screenBox.top + index * step;

    await setBounds(page, { left, top, width, height });
}

async function closeAll() {
    for (const { context } of opened) {
        await context.close().catch(() => undefined);
    }

    await control?.close();
    // Connected over CDP: this disconnects; the host's browser keeps running (chrome.sh stop quits it).
    await browser.close().catch(() => undefined);
}

if (docked) {
    try {
        control = await openControl(browser, {
            getState: () => payload(null),
            onEvent: (event) => answer(null, null, event),
        });
    } catch (error) {
        log({ type: 'error', text: `control window: ${error.message.split('\n')[0]}` });
        await closeAll();
        fail(`the control window did not open: ${error.message.split('\n')[0]} (--panel overlay works without it)`);
    }
}

async function openWindow(win) {
    const origin = originOf(win);
    const label = win.name ? `[${win.name}] ` : '';
    const context = await browser.newContext({
        // A desktop window shows the page at the window's own size; a phone is emulated at 360 px.
        viewport: win.mobile ? PHONE.viewport : null,
        ...(win.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
        colorScheme: win.dark ? 'dark' : 'light',
    });

    context.on('page', (page) => {
        page.on('pageerror', (error) => report(`problem: ${label}JS error on ${page.url()}: ${error.message}`));
        page.on('response', (response) => {
            if (response.status() >= 400 && !response.url().includes('/favicon')) {
                report(`problem: ${label}${response.status()} ${response.url()}`);
            }
        });
    });

    const first = await context.newPage();

    if (control) {
        // Next to the control window: every window of a kind in the same place, a little staggered.
        const spot = { mobile: Boolean(win.mobile), index: win.mobile ? phones++ : desktops++, phones: anyPhone };

        await placeWindow(first, control.area, spot);
        // More paths, or a link that opens a new window: it goes in the same place.
        context.on('page', (page) => void placeWindow(page, control.area, spot));
    } else {
        await cascade(first, win.mobile);
    }

    try {
        if (win.login) {
            await signIn(first, { surface: surfaceOf(win), origin, login: win.login, password: password(win.login) });
        }
    } catch (error) {
        const reason = error.message.split('\n')[0];

        console.error(`problem: ${label}sign-in failed: ${reason}\n${SIGNIN_HINT}`);

        if (tourFile) {
            log({ type: 'error', window: win.name, text: `sign-in failed: ${reason}` });
        }

        opened.push({ win, context });
        await closeAll();
        process.exit(1);
    }

    // The panel or the ring comes after the sign-in, so it never covers the sign-in form.
    if (docked) {
        await addRing(context, () => payload(win));
    } else if (tourFile) {
        await context.exposeBinding('__tourGet', () => payload(win));
        await context.exposeBinding('__tourSend', ({ page }, event) => answer(win, page, event ?? {}));
        await context.addInitScript({ path: join(HERE, 'tour-panel.js') });
    }

    for (const [index, path] of win.paths.entries()) {
        const page = index === 0 ? first : await context.newPage();

        await page.goto(address(origin, path)).catch((error) => report(`problem: ${label}${path}: ${error.message.split('\n')[0]}`));
    }

    if (win.paths.length > 1) {
        await first.bringToFront();
    }

    opened.push({ win, context });
    console.log(`ready: ${label}${win.login ?? 'no account'}${origin ? ` on ${origin}` : ''}: ${win.paths.length} tab(s)`);
}

// Stopped from outside (a signal): the windows close with it, and the log says why.
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        if (stopping) {
            return;
        }

        stopping = true;

        if (tourFile) {
            log({ type: 'closed', why: 'stopped' });
        }

        await closeAll();
        process.exit(0);
    });
}

for (const win of windows) {
    await openWindow(win);
}

if (tourFile) {
    await broadcast();
    await showStepWindow();
    await control?.page.bringToFront().catch(() => undefined);
    log({ type: 'ready', windows: windows.map((win) => win.name ?? null), panel: docked ? 'docked' : 'overlay' });
}

// Stay up until the person closes every window, or the control window.
const why = await new Promise((finish) => {
    const check = () => {
        if (opened.every(({ context }) => context.pages().length === 0)) {
            finish('windows');
        }
    };

    browser.on('disconnected', () => finish('browser'));
    control?.page.on('close', () => finish('control'));

    for (const { context } of opened) {
        context.on('page', (page) => page.on('close', check));
        context.pages().forEach((page) => page.on('close', check));
    }
});

if (stopping) {
    // The signal handler logs, closes and exits.
    await new Promise(() => undefined);
}

if (tourFile) {
    log({ type: 'closed', why });
}

await closeAll();
console.log('closed');
process.exit(0);
