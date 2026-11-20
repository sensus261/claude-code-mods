// How a tour or demo window signs in (guided-tour.md, next to this folder), shared by open.mjs and
// demo.mjs. Managed by /shipkit:forge.
//
// Surfaces (the project's sign-in recipes) come from surfaces.json next to this file:
//   { "<name>": { "base": "http://localhost:8000",
//                 "signin": { "path": "/login",
//                             "fields": { "input[name=\"email\"]": "$login", "input[name=\"password\"]": "$password" },
//                             "submit": "button[type=\"submit\"]",
//                             "leaves": "/login",            // signed in once the URL path no longer starts with it
//                             "error": ".alert-error" },     // optional: the element that says why it failed
//                 "module": "signin.mjs" } }                 // optional instead of "signin": export async function signIn({ page, origin, login, password, surface })
// Passwords live only in the accounts file (JSON {"<login>": "<password>"}, git-ignored, chmod 600):
// never in a tour file, a part script or on a command line, never printed or logged.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE } from './tour-control.mjs';

export const trim = (url) => String(url ?? '').replace(/\/$/, '');
export const isUrl = (path) => /^https?:\/\//.test(path);

// The surfaces file, or {} when there is none (every window then names a base or whole addresses).
export function readSurfaces(file = join(HERE, 'surfaces.json')) {
    if (!existsSync(file)) {
        return {};
    }

    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`cannot read ${file}: ${error.message.split('\n')[0]}`);
    }
}

export function readAccounts(file) {
    if (!file) {
        throw new Error('a window signs in but no accounts file is given ("accounts" in the tour file, --accounts, or DEMO_ACCOUNTS)');
    }

    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`cannot read the accounts file ${file}: ${error.message.split('\n')[0]}`);
    }
}

// The page's address for `path`: a whole http(s) address as is, else relative to `origin`.
export function address(origin, path) {
    return isUrl(path) ? path : `${trim(origin)}${path.startsWith('/') ? path : `/${path}`}`;
}

// Signs `page` in on `surface` (a surfaces.json entry) as `login`, with `password` (from the accounts
// file). A failure throws with what the sign-in form said, when it says something.
export async function signIn(page, { surface, origin, login, password }) {
    if (surface.module) {
        const mod = await import(pathToFileURL(resolve(HERE, surface.module)).href);

        await mod.signIn({ page, origin, login, password, surface });

        return;
    }

    const recipe = surface.signin;
    const fill = (value) => (value === '$login' ? login : value === '$password' ? password : value);

    await page.goto(`${trim(origin)}${recipe.path}`);

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

// The hint printed after a failed sign-in: a blank sign-in page almost always means the app is not served.
export const SIGNIN_HINT =
    'Check: the service is up, the front end has a current build, the account exists and is enabled, ' +
    'its password in the accounts file is current, the surface recipe in surfaces.json matches the sign-in form.';
