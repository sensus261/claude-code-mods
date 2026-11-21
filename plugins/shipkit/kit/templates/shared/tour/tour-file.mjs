// A committed guided tour (<shared>/tours/<ID>/tour.json, format v2; guided-tour.md, next to this
// folder): reading it, checking it, filling in its vars, the stale check and the PR / MR description
// block. Pure functions, shared by tour.mjs and the kit's tests. Managed by /shipkit:forge.
//
// {
//   "version": 2, "id": "issue-118", "title": "#118 · A member edits an item's title",
//   "pr": 120, "verifiedOn": "abc1234", "verifiedAt": "2026-11-21",
//   "vars": { "ITEM": { "what": "an item the member owns" } },
//   "touches": ["src/items/**"],
//   "windows": [{ "name": "Member", "surface": "app", "login": "tour-member@example.test", "paths": ["/items/{ITEM}"] }],
//   "steps": [{ "window": "Member", "do": "…", "see": "…", "highlight": "…", "path": "…", "touches": ["…"] }],
//   "i18n": { … }
// }
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const VERSION = 2;
export const MAX_STEPS = 8;

const VAR = /\{([A-Z][A-Z0-9_]*)\}/g;
// What only the live copy of a tour holds (tour.mjs writes it under .claude/.tmp/tour/), never the
// committed file.
const LIVE_ONLY = ['status', 'state', 'current', 'accounts', 'shots'];
// A token in a link: a signed parameter, or a long segment with both letters and digits (a file name
// like "DeliveryControllerIntegrationTest" has no digit).
export function hasToken(text) {
    if (/[?&](?:token|signature)=/i.test(text)) {
        return true;
    }

    return [...String(text).matchAll(/[A-Za-z0-9_-]{24,}/g)].some(([s]) => /\d/.test(s) && /[A-Za-z]/.test(s));
}

// A tour ID names a folder: letters, digits, "-" and "_", never only digits (a number is a PR / MR).
export const isTourId = (id) => /^(?!\d+$)[A-Za-z0-9][A-Za-z0-9_-]*$/.test(String(id ?? ''));

export function tourIds(dir) {
    return existsSync(dir)
        ? readdirSync(dir)
              .filter((name) => existsSync(join(dir, name, 'tour.json')))
              .sort()
        : [];
}

// The folder of `id` in `dir`, matched as typed or without regard to case (A12 = a12); null if none.
export function resolveId(dir, id) {
    const ids = tourIds(dir);

    return ids.find((x) => x === id) ?? ids.find((x) => x.toLowerCase() === String(id).toLowerCase()) ?? null;
}

export function readTour(dir, id) {
    return JSON.parse(readFileSync(join(dir, id, 'tour.json'), 'utf8'));
}

// "a/**" matches everything under a/, "**/" any folders, "*" stays inside one folder, "?" one
// character; a pattern ending in "/" is the whole folder.
export function globToRegExp(glob) {
    const source = String(glob).endsWith('/') ? `${glob}**` : String(glob);
    let re = '';

    for (let i = 0; i < source.length; i++) {
        const c = source[i];

        if (c === '*' && source[i + 1] === '*') {
            i++;

            if (source[i + 1] === '/') {
                i++;
                re += '(?:.*/)?';
            } else {
                re += '.*';
            }
        } else if (c === '*') {
            re += '[^/]*';
        } else if (c === '?') {
            re += '[^/]';
        } else {
            re += c.replace(/[.+^${}()|[\]\\]/, '\\$&');
        }
    }

    return new RegExp(`^${re}$`);
}

// `value` with every {NAME} that `vars` knows replaced; the others stay as they are.
export function fill(value, vars) {
    if (typeof value === 'string') {
        return value.replace(VAR, (all, name) => (name in vars ? String(vars[name]) : all));
    }

    if (Array.isArray(value)) {
        return value.map((item) => fill(item, vars));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item, vars)]));
    }

    return value;
}

// The {NAME}s the windows and the steps use, sorted (the "vars" descriptions may name them too).
export function placeholders(tour) {
    const text = JSON.stringify([tour.windows ?? [], tour.steps ?? []]);

    return [...new Set([...text.matchAll(VAR)].map((m) => m[1]))].sort();
}

export const leftovers = (value) => [...new Set([...JSON.stringify(value).matchAll(VAR)].map((m) => `{${m[1]}}`))];

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');
const isUrl = (path) => /^https?:\/\//.test(path);

// What is wrong with a tour file, one line each; [] when nothing. `surfaces` (tour/surfaces.json) adds
// the checks on each window's surface and sign-in.
export function lint(tour, id, { surfaces = null } = {}) {
    const errors = [];
    const err = (line) => errors.push(line);

    if (!tour || typeof tour !== 'object' || Array.isArray(tour)) {
        return ['not a JSON object'];
    }

    if (tour.version !== VERSION) err(`"version": ${VERSION}`);
    if (tour.id !== id) err(`"id" is "${tour.id}", the folder is "${id}"`);
    if (!isTourId(id)) err(`"${id}" is not a tour ID: letters, digits, "-" and "_", not only digits`);
    if (!nonEmpty(tour.title)) err('"title" is missing');

    for (const key of LIVE_ONLY) {
        if (key in tour) err(`"${key}" belongs to the live copy only (tour.mjs writes it), not to the committed tour`);
    }

    if (tour.verifiedOn !== undefined && !/^[0-9a-f]{7,40}$/.test(String(tour.verifiedOn))) err('"verifiedOn": a commit sha');
    if (tour.verifiedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(tour.verifiedAt))) err('"verifiedAt": YYYY-MM-DD');
    if (tour.pr !== undefined && !Number.isInteger(tour.pr)) err('"pr": a number');
    if (tour.touches !== undefined && !strings(tour.touches)) err('"touches": a list of paths or globs');

    const names = [];

    if (!Array.isArray(tour.windows) || tour.windows.length === 0) {
        err('"windows" is empty');
    } else {
        tour.windows.forEach((win, i) => {
            const at = `windows[${i}]`;

            if (!nonEmpty(win?.name)) {
                err(`${at}: "name" is missing`);
            } else if (names.includes(win.name)) {
                err(`${at}: a second window named "${win.name}"`);
            } else {
                names.push(win.name);
            }

            if (!strings(win?.paths) || win.paths.length === 0) err(`${at}: "paths" is empty`);

            if (surfaces && win?.surface !== undefined && !surfaces[win.surface]) {
                err(`${at}: no surface "${win.surface}" in tour/surfaces.json`);
            }

            const surface = surfaces?.[win?.surface];

            if (win?.login !== undefined && !win.surface) err(`${at}: a "login" needs a "surface"`);
            if (surfaces && win?.login !== undefined && surface && !surface.signin && !surface.module) {
                err(`${at}: surface "${win.surface}" has no "signin" or "module" to sign in with`);
            }

            if (!win?.surface && !win?.base && strings(win?.paths) && !win.paths.every(isUrl)) {
                err(`${at}: no "surface" or "base", so every path must be a whole http(s) address`);
            }
        });
    }

    if (!Array.isArray(tour.steps) || tour.steps.length === 0) {
        err('"steps" is empty');
    } else {
        if (tour.steps.length > MAX_STEPS) err(`${tour.steps.length} steps: at most ${MAX_STEPS} (more: a second tour)`);

        tour.steps.forEach((step, i) => {
            const at = `steps[${i}]`;

            if (!nonEmpty(step?.do)) err(`${at}: "do" is missing`);
            if (!nonEmpty(step?.see)) err(`${at}: "see" is missing`);
            if (step?.window !== undefined && !names.includes(step.window)) err(`${at}: no window named "${step.window}"`);
            if (step?.touches !== undefined && !strings(step.touches)) err(`${at}: "touches": a list of paths or globs`);
        });
    }

    const declared = Object.keys(tour.vars ?? {}).sort();

    for (const [name, v] of Object.entries(tour.vars ?? {})) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) err(`vars: "${name}" is not an UPPER_CASE name`);
        if (!nonEmpty(v?.what)) err(`vars.${name}: "what" is missing (the row in words)`);
    }

    const used = placeholders(tour);

    for (const name of used.filter((n) => !declared.includes(n))) err(`{${name}} is used but not declared in "vars"`);
    for (const name of declared.filter((n) => !used.includes(n))) err(`vars.${name} is declared but no window or step uses it`);

    // Paths and globs in "touches" are file names, not secrets.
    const { touches, steps, ...rest } = tour;
    const text = JSON.stringify([rest, (steps ?? []).map(({ touches: _, ...step }) => step)]);

    if (hasToken(text)) err('it holds what looks like a token or a signed link: a link with a token is read at run time, never written down');

    return errors;
}

// The steps whose files changed: `changed` is the list of changed paths since the tour was checked.
// Tour-wide "touches" count for every step.
export function stale(tour, changed) {
    const hits = (globs) => {
        const res = (globs ?? []).map(globToRegExp);

        return changed.filter((file) => res.some((re) => re.test(file)));
    };
    const all = hits(tour.touches);

    return {
        all,
        steps: (tour.steps ?? []).map((step, index) => ({ index, files: [...new Set([...all, ...hits(step.touches)])] })),
    };
}

// The PR / MR description block: a pointer to the committed tour, and its steps for people who go by
// hand. `marker` is the toolkit's prefix; `run` the command that runs it.
export function markdown(tour, id, { marker, run, file }) {
    const windows = Object.fromEntries((tour.windows ?? []).map((w) => [w.name, w]));
    const lines = (tour.steps ?? []).map((step, i) => {
        const win = windows[step.window] ?? tour.windows[0];

        return `${i + 1}. [${win.name} · ${win.login ?? 'no account'}] ${step.do} ✓ ${step.see}`;
    });
    const vars = Object.entries(tour.vars ?? {}).map(([name, v]) => `- \`{${name}}\`: ${v.what}`);

    return [
        `<!-- ${marker}:guided-tour -->`,
        `<details><summary>Guided tour · ${id} · checked on ${tour.verifiedOn ?? '—'} (${tour.verifiedAt ?? 'not yet'})</summary>`,
        '',
        `Run it with \`${run}\` (no agent needed: it checks the stack, makes the data and opens the windows signed in), or follow it by hand on the dev stack. The tour lives in \`${file}\`.`,
        '',
        ...lines,
        ...(vars.length ? ['', ...vars] : []),
        '',
        '</details>',
        `<!-- /${marker}:guided-tour -->`,
    ].join('\n');
}
