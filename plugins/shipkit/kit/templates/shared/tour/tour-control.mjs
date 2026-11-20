// The guided tour's browser and windows (guided-tour.md, next to this folder), shared by open.mjs (a
// tour) and demo.mjs (a guided demo). Managed by /shipkit:forge.
//
// - connect(): Playwright from the project's own dependencies, connected over the DevTools port to the
//   browser chrome.sh started on the host.
// - openControl(): the control window, the tour panel (tour-panel.js, "docked") alone in its own window
//   at the right edge of the screen; it returns the screen area left for the app windows.
// - placeWindow(): puts an app window in that area. addRing() / renderRing(): the app pages show only a
//   pulsing ring around the element the current step names (tour-panel.js, "ring"), so the panel never
//   covers the app.
// Window placement uses the DevTools protocol; in a headless browser it is skipped.
import { existsSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');

const PANEL = join(HERE, 'tour-panel.js');
const CONTROL_URL = 'http://tour.control/';
const CONTROL_PAGE =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tour control</title>' +
    '<meta name="color-scheme" content="light dark"></head><body></body></html>';
const GAP = 8;

// A phone window: a 360 px page (emulated) inside a window about as narrow as Chrome allows.
export const PHONE = { viewport: { width: 360, height: 740 }, window: { width: 420, height: 880 } };

// --- The browser ----------------------------------------------------------------------------------

// Playwright from the project's own dependencies: --playwright <dir>, TOUR_PLAYWRIGHT, the current
// directory, the repo root (tour.md §Runner says where it lives).
export function loadPlaywright(dir) {
    const places = [dir, process.env.TOUR_PLAYWRIGHT, process.cwd(), ROOT].filter(Boolean);

    for (const place of places) {
        for (const pkg of ['@playwright/test', 'playwright']) {
            try {
                return createRequire(join(resolve(place), 'package.json'))(pkg);
            } catch {
                // Try the next one.
            }
        }
    }

    throw new Error(
        "neither @playwright/test nor playwright resolves. Install the project's dev dependencies, " +
            'or pass --playwright <dir> / TOUR_PLAYWRIGHT (tour.md §Runner says where it lives).',
    );
}

export const inContainer = () => existsSync('/.dockerenv') || existsSync('/run/.containerenv');

// The DevTools address: --cdp, TOUR_CDP, else the host's port as seen from here.
export const defaultCdp = () =>
    process.env.TOUR_CDP ?? (inContainer() ? 'http://host.docker.internal:9222' : 'http://127.0.0.1:9222');

// Chrome's DevTools answer only a Host that is an IP address or localhost, so the name is resolved here.
async function endpoint(raw) {
    const url = new URL(raw);

    if (!isIP(url.hostname) && url.hostname !== 'localhost') {
        url.hostname = (await lookup(url.hostname, { family: 4 })).address;
    }

    return url.origin;
}

// Connects to the browser chrome.sh started. Returns { browser, screen }: `screen` is read from the blank
// window chrome.sh opened (then closed, so only the tour's windows stay), or null when there is none.
// An error with `noBrowser` set means nothing answers on the DevTools port.
export async function connect({ cdp = defaultCdp(), playwright, slowMo } = {}) {
    const { chromium } = loadPlaywright(playwright);
    let browser;

    try {
        browser = await chromium.connectOverCDP(await endpoint(cdp), { timeout: 10000, slowMo });
    } catch (error) {
        const failure = new Error(
            `no browser on ${cdp}: ${error.message.split('\n')[0]}\nStart it on the host first: ${join(HERE, 'chrome.sh')}`,
        );

        failure.noBrowser = true;
        throw failure;
    }

    let box = null;

    for (const page of browser.contexts()[0]?.pages() ?? []) {
        if (!/^(about:blank|chrome:\/\/new-tab-page)/.test(page.url())) {
            continue;
        }

        box =
            (await page
                .evaluate(() => ({
                    left: window.screen.availLeft ?? 0,
                    top: window.screen.availTop ?? 0,
                    width: window.screen.availWidth,
                    height: window.screen.availHeight,
                }))
                .catch(() => null)) ?? box;
        await page.close().catch(() => undefined);
    }

    return { browser, screen: box };
}

// --- Windows --------------------------------------------------------------------------------------

// Moves and resizes the browser window that holds `page`. Partial bounds ({ left, top }) only move it.
// Returns the bounds the window really got (Chromium keeps a minimum width), or null when it cannot tell.
export async function setBounds(page, bounds) {
    try {
        const cdp = await page.context().newCDPSession(page);
        const { windowId } = await cdp.send('Browser.getWindowForTarget');

        // A maximized or full-screen window ignores new bounds until it is normal again.
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await cdp.send('Browser.setWindowBounds', {
            windowId,
            bounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])),
        });
        const { bounds: actual } = await cdp.send('Browser.getWindowBounds', { windowId });

        await cdp.detach();

        return actual;
    } catch {
        // Headless, another browser, or a window already closed: leave it where it is.
        return null;
    }
}

// Opens the control window and returns it with `area`, the screen space left for the app windows.
// `getState()` gives the panel's state (title, status, state, steps, current, results, done, and the
// optional labels of tour-panel.js); `onEvent(event)` gets the person's answers:
// { type: 'ok' | 'go' | 'problem' | 'open', step, text }.
export async function openControl(browser, { getState, onEvent }) {
    // No emulation: the control window follows the system's light / dark and fills its own window.
    const context = await browser.newContext({ viewport: null, colorScheme: null });

    await context.exposeBinding('__tourGet', () => getState());
    await context.exposeBinding('__tourSend', (_source, event) => onEvent(event ?? {}));
    await context.addInitScript({ content: "window.__tourMode = 'docked';" });
    await context.addInitScript({ path: PANEL });
    await context.route(`${CONTROL_URL}**`, (route) =>
        route.fulfill({ contentType: 'text/html', body: CONTROL_PAGE }),
    );

    const page = await context.newPage();

    await page.goto(CONTROL_URL);

    const screen = await page.evaluate(() => ({
        left: window.screen.availLeft ?? 0,
        top: window.screen.availTop ?? 0,
        width: window.screen.availWidth,
        height: window.screen.availHeight,
    }));
    // Wide enough to read, narrow enough to leave the app a desktop layout (about 1050 px) on a laptop.
    const right = screen.left + screen.width;
    let width = Math.min(440, Math.max(340, screen.width - 1050));
    const actual = await setBounds(page, { left: right - width, top: screen.top, width, height: screen.height });

    // Chromium may keep the window wider than asked (its minimum width): pull it back inside the screen.
    if (actual && actual.width > width) {
        width = actual.width;
        await setBounds(page, { left: right - width, top: screen.top, width, height: screen.height });
    }

    return {
        context,
        page,
        layout: { screen, control: { left: right - width, width } },
        area: { left: screen.left, top: screen.top, width: screen.width - width - GAP, height: screen.height },
        render: (state) => page.evaluate((s) => window.__tourRender?.(s), state).catch(() => undefined),
        close: () => context.close().catch(() => undefined),
    };
}

// Puts an app window in `area`. A desktop window fills it; a phone window keeps its size at the area's
// right edge, next to the control window. When the area is wide enough for both, desktop windows leave
// that column to the phones (`phones`: some window of the tour is a phone); otherwise they overlap and the
// step's window comes forward. `index` staggers windows of the same kind, so the ones behind still show
// their title bar.
export async function placeWindow(page, area, { mobile = false, index = 0, phones = false } = {}) {
    const shift = Math.min(index, 4) * 28;
    const column = PHONE.window.width + GAP;

    if (mobile) {
        await setBounds(page, {
            left: area.left + Math.max(0, area.width - PHONE.window.width - shift),
            top: area.top + shift,
            width: PHONE.window.width,
            height: Math.min(PHONE.window.height, area.height - shift),
        });

        return;
    }

    const beside = phones && area.width - column >= 1024;

    await setBounds(page, {
        left: area.left + shift,
        top: area.top + shift,
        width: area.width - (beside ? column : 0) - shift,
        height: area.height - shift,
    });
}

// Adds the highlight ring (no panel) to every page of an app window. `getState()` is the control
// window's state with `me` set to this window's name, so the ring shows only in the window the current
// step is about.
export async function addRing(context, getState) {
    await context.exposeBinding('__tourGet', () => getState());
    await context.addInitScript({ content: "window.__tourMode = 'ring';" });
    await context.addInitScript({ path: PANEL });
}

// Pushes the state to every page of an app window (the ring follows the current step).
export async function renderRing(context, state) {
    for (const page of context.pages()) {
        await page.evaluate((s) => window.__tourRender?.(s), state).catch(() => undefined);
    }
}
