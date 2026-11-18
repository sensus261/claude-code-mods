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
// Surfaces (the project's sign-in recipes) come from surfaces.json next to this file (or --surfaces):
//   { "<name>": { "base": "http://localhost:8000",
//                 "signin": { "path": "/login",
//                             "fields": { "input[name=\"email\"]": "$login", "input[name=\"password\"]": "$password" },
//                             "submit": "button[type=\"submit\"]",
//                             "leaves": "/login",            // signed in once the URL path no longer starts with it
//                             "error": ".alert-error" },     // optional: the element that says why it failed
//                 "module": "signin.mjs" } }                 // optional instead of "signin": export async function signIn({ page, origin, login, password })
//
// Options: --surface <name>, --login <id> (an account of that surface), --accounts <file> (JSON
//          {"<login>": "<password>"}: passwords live only in that git-ignored file, never in a tour file
//          or on a command line), --base <url>, --mobile (360x740, touch), --dark, --name <window label>,
//          --surfaces <file>, --cdp <url> (default TOUR_CDP, else http://host.docker.internal:9222 in a
//          container, http://127.0.0.1:9222 on the host), --playwright <dir> (where @playwright/test or
//          playwright resolves; default TOUR_PLAYWRIGHT, then the current directory, then the repo root).
// Every argument without "--" is a path, opened in its own tab: relative to the base, or a whole
// http(s) address (a page with no account). The script stays up until the person closes the windows,
// and prints JS errors and responses >= 400 as they happen. Run it in the background.
//
// --tour <file.json> opens one window per entry of its "windows" (each: name, surface, login, base,
// paths, mobile, dark) and shows the tour panel (tour-panel.js, next to this file) on every page. The
// file is watched: edit "status", "state", "steps" or "current" and every open page updates. The
// person's answers are appended to <file>.log, one JSON line each:
// {"type":"ok"|"problem"|"go"|"done"|"ready"|"closed"|"error", "step": <1-based>, "window", "text", "url", "shot"}.
import { appendFileSync, existsSync, readFileSync, watchFile } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

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

// --- Playwright, from the project's own dependencies --------------------------------------------

function loadPlaywright() {
    const places = [values.get('--playwright'), process.env.TOUR_PLAYWRIGHT, process.cwd(), ROOT].filter(Boolean);

    for (const place of places) {
        for (const pkg of ['@playwright/test', 'playwright']) {
            try {
                return createRequire(join(resolve(place), 'package.json'))(pkg);
            } catch {
                // Try the next one.
            }
        }
    }

    console.error(
        'problem: neither @playwright/test nor playwright resolves. Install the project\'s dev dependencies, ' +
            'or pass --playwright <dir> (tour.md §Runner says where it lives).',
    );
    process.exit(1);
}

const { chromium } = loadPlaywright();

const tourFile = values.get('--tour');
const tourStem = tourFile?.replace(/\.json$/, '');
const logFile = `${tourStem}.log`;
const trim = (url) => url.replace(/\/$/, '');
const inContainer = existsSync('/.dockerenv') || existsSync('/run/.containerenv');
const cdp =
    values.get('--cdp') ??
    process.env.TOUR_CDP ??
    (inContainer ? 'http://host.docker.internal:9222' : 'http://127.0.0.1:9222');

function readTour() {
    return JSON.parse(readFileSync(tourFile, 'utf8'));
}

let surfaces = {};
const surfacesFile = values.get('--surfaces') ?? join(HERE, 'surfaces.json');

if (existsSync(surfacesFile)) {
    try {
        surfaces = JSON.parse(readFileSync(surfacesFile, 'utf8'));
    } catch (error) {
        console.error(`problem: cannot read ${surfacesFile}: ${error.message.split('\n')[0]}`);
        process.exit(1);
    }
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

const isUrl = (path) => /^https?:\/\//.test(path);
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
    console.error(
        `problem: window ${JSON.stringify(bad.name ?? bad.surface ?? '')} is incomplete.\n` +
            'Usage: node open.mjs [--surface <name> --login <id> --accounts <file>] [--mobile] [--dark] [--base <url>] <path or url>...\n' +
            '       node open.mjs --tour <file.json>\n' +
            'Every window needs "paths"; a "surface" must be in surfaces.json; a "login" needs a surface with "signin" or "module"; ' +
            'a window without a surface needs a "base" or whole http(s) addresses.',
    );
    process.exit(1);
}

let accounts = {};

if (windows.some((win) => win.login)) {
    if (!accountsFile) {
        console.error('problem: a window signs in but no accounts file is given ("accounts" in the tour file, or --accounts)');
        process.exit(1);
    }

    try {
        accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));
    } catch (error) {
        console.error(`problem: cannot read the accounts file ${accountsFile}: ${error.message.split('\n')[0]}`);
        process.exit(1);
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
        me: win.name ?? null,
    };
}

async function broadcast() {
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

async function answer(win, page, event) {
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
        log({ type: 'ok', step, window: win.name, url: page.url() });

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

        // The screenshot shows the app as the person sees it, without the panel.
        await page.evaluate(() => window.__tourHide?.(true)).catch(() => undefined);
        await page.screenshot({ path: shot, type: 'jpeg', quality: 80 }).catch(() => undefined);
        await page.evaluate(() => window.__tourHide?.(false)).catch(() => undefined);
        log({ type: 'problem', step, window: win.name, text: String(event.text ?? '').slice(0, 2000), url: page.url(), shot });
    }

    await broadcast();
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

        if (tour.current !== undefined && tour.current !== lastFileCurrent) {
            current = clamp(tour.current - 1);
            delete results[current];
            done = false;
        }

        lastFileCurrent = tour.current;
        current = clamp(current);
        await broadcast();
    });
}

// --- The host's browser -------------------------------------------------------------------------

// Chrome's DevTools answer only a Host that is an IP address or localhost, so the name is resolved here.
async function endpoint(raw) {
    const url = new URL(raw);

    if (!isIP(url.hostname) && url.hostname !== 'localhost') {
        url.hostname = (await lookup(url.hostname, { family: 4 })).address;
    }

    return url.origin;
}

let browser;

try {
    browser = await chromium.connectOverCDP(await endpoint(cdp), { timeout: 10000 });
} catch (error) {
    const reason = error.message.split('\n')[0];

    console.error(`problem: no browser on ${cdp}: ${reason}\nStart it on the host first: ${join(HERE, 'chrome.sh')}`);

    if (tourFile) {
        log({ type: 'error', text: `no browser: ${reason}` });
    }

    process.exit(1);
}

// The screen, read from the blank window chrome.sh opened (not emulated), which is then closed:
// only the tour's windows stay.
let screenBox = { x: 0, y: 0, w: 1440, h: 900 };

for (const page of browser.contexts()[0]?.pages() ?? []) {
    if (!/^(about:blank|chrome:\/\/new-tab-page)/.test(page.url())) {
        continue;
    }

    screenBox = await page
        .evaluate(() => ({ x: screen.availLeft ?? 0, y: screen.availTop ?? 0, w: screen.availWidth, h: screen.availHeight }))
        .catch(() => screenBox);
    await page.close().catch(() => undefined);
}

const seen = new Set();

function report(line) {
    if (!seen.has(line)) {
        seen.add(line);
        console.log(line);
    }
}

// Desktop windows cascade from the left, phone windows stack on the right.
const anyPhone = windows.some((win) => win.mobile);
let desktops = 0;
let phones = 0;

async function placeWindow(page, mobile) {
    const step = 36;
    const width = mobile ? 420 : Math.min(1280, screenBox.w - (anyPhone ? 440 : 0));
    const height = Math.min(mobile ? 880 : 900, screenBox.h);
    const index = mobile ? phones++ : desktops++;
    const left = mobile ? screenBox.x + screenBox.w - width - index * step : screenBox.x + index * step;
    const top = screenBox.y + index * step;

    try {
        const session = await page.context().newCDPSession(page);
        const { windowId } = await session.send('Browser.getWindowForTarget');

        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await session.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } });
        await session.detach();
    } catch {
        // Only the layout: the window still works where the browser put it.
    }
}

async function signIn(page, win, origin) {
    if (!win.login) {
        return;
    }

    const surface = surfaceOf(win);

    if (surface.module) {
        const mod = await import(pathToFileURL(resolve(HERE, surface.module)).href);

        await mod.signIn({ page, origin, login: win.login, password: password(win.login), surface });

        return;
    }

    const recipe = surface.signin;
    const fill = (value) => (value === '$login' ? win.login : value === '$password' ? password(win.login) : value);

    await page.goto(`${origin}${recipe.path}`);

    for (const [selector, value] of Object.entries(recipe.fields ?? {})) {
        await page.fill(selector, fill(value), { timeout: 15000 });
    }

    await page.click(recipe.submit);

    const leaves = recipe.leaves ?? recipe.path;

    await page.waitForURL((url) => !url.pathname.startsWith(leaves), { timeout: 15000 }).catch(async (error) => {
        const said = recipe.error
            ? await page.locator(recipe.error).first().innerText({ timeout: 1000 }).catch(() => '')
            : '';

        throw new Error(said || error.message);
    });
}

async function closeAll() {
    for (const { context } of opened) {
        await context.close().catch(() => undefined);
    }

    // Connected over CDP: this disconnects; the host's browser keeps running (chrome.sh stop quits it).
    await browser.close().catch(() => undefined);
}

async function openWindow(win) {
    const origin = originOf(win);
    const label = win.name ? `[${win.name}] ` : '';
    const context = await browser.newContext({
        // A desktop window shows the page at the window's own size; a phone is emulated at 360 px.
        viewport: win.mobile ? { width: 360, height: 740 } : null,
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

    await placeWindow(first, win.mobile);

    try {
        await signIn(first, win, origin);
    } catch (error) {
        // A blank sign-in page almost always means the app is not served (a missing build, a stopped service).
        const reason = error.message.split('\n')[0];

        console.error(
            `problem: ${label}sign-in failed: ${reason}\n` +
                'Check: the service is up, the front end has a current build, the account exists and is enabled, ' +
                'its password in the accounts file is current, the surface recipe in surfaces.json matches the sign-in form.',
        );

        if (tourFile) {
            log({ type: 'error', window: win.name, text: `sign-in failed: ${reason}` });
        }

        opened.push({ win, context });
        await closeAll();
        process.exit(1);
    }

    // The panel comes after the sign-in, so it never covers the sign-in form (on a phone it is a bottom sheet).
    if (tourFile) {
        await context.exposeBinding('__tourGet', () => payload(win));
        await context.exposeBinding('__tourSend', ({ page }, event) => answer(win, page, event ?? {}));
        await context.addInitScript({ path: join(HERE, 'tour-panel.js') });
    }

    for (const [index, path] of win.paths.entries()) {
        const page = index === 0 ? first : await context.newPage();
        const url = isUrl(path) ? path : `${origin}${path.startsWith('/') ? path : `/${path}`}`;

        await page.goto(url).catch((error) => report(`problem: ${label}${path}: ${error.message.split('\n')[0]}`));
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
    log({ type: 'ready', windows: windows.map((win) => win.name ?? null) });
}

// Stay up until the person closes every window.
await new Promise((finish) => {
    const check = () => {
        if (opened.every(({ context }) => context.pages().length === 0)) {
            finish();
        }
    };

    browser.on('disconnected', finish);

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
    log({ type: 'closed' });
}

await closeAll();
console.log('closed');
process.exit(0);
