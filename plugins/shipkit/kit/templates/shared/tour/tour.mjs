#!/usr/bin/env node
// Runs a committed guided tour without an agent (<shared>/tours/<ID>/tour.json; the format and the
// rules are in guided-tour.md, next to this folder). Managed by /shipkit:forge.
//
//   node <this folder>/tour.mjs <ID>              a tour, on the branch you are on
//   node <this folder>/tour.mjs <number>          the tour a PR / MR adds or changes: offers to check it out first
//   node <this folder>/tour.mjs                   the tour this branch adds or changes
//   node <this folder>/tour.mjs --list            the tours in this checkout
//   node <this folder>/tour.mjs <ID> --check      no windows: the steps whose files changed since the tour was checked
//   node <this folder>/tour.mjs [<ID>] --lint     no windows, no stack: is every tour file well formed (for CI)
//   node <this folder>/tour.mjs <ID> --prepare    no windows: make the tour's data and print its vars
//   node <this folder>/tour.mjs <ID> --markdown   the PR / MR description block (for people who go by hand)
//
// A run checks the dev stack (tour/runner.json "preflight"), makes the tour's data and accounts (its
// "prepare" command), starts the tour browser (chrome.sh), opens the windows signed in beside the
// control window (open.mjs --tour), prints each ✓ / ✗, and writes a report when the windows close;
// asked, it posts the report on the open PR / MR. Options: --panel overlay (one small screen), --agent
// (Claude Code follows the log and answers every ✗ itself: nothing is noted or asked here).
// TOUR_HEADLESS=1 (with a headless chrome.sh) closes the tour once it is ready: only to smoke-test.
// Exit codes: 0 done, 1 an error, 2 --check found stale steps.
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { mask } from './demo.mjs';
import {
    HERE,
    PR_WORD,
    ROOT,
    SHARED,
    TMP,
    ask,
    branch,
    checkoutPr,
    closePrompt,
    command,
    commentPr,
    config,
    currentPr,
    dirty,
    fail,
    launch,
    preflight,
    prFiles,
    readJson,
    rel,
    runner,
    say,
    sh,
    show,
    startBrowser,
    status,
    stopBrowser,
    usage,
    viewPr,
    warn,
} from './stack.mjs';
import { readSurfaces } from './surfaces.mjs';
import { fill, isTourId, leftovers, lint, markdown, readTour, resolveId, stale, tourIds } from './tour-file.mjs';

const TOURS = join(SHARED, 'tours');
const WORK = join(TMP, 'tour');

process.chdir(ROOT);

// --- Arguments --------------------------------------------------------------------------------

const opts = { positional: [] };
const argv = process.argv.slice(2);

for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (['--list', '--check', '--lint', '--prepare', '--markdown', '--agent'].includes(arg)) {
        opts[arg.slice(2)] = true;
    } else if (arg === '--panel') {
        opts.panel = argv[++i];
    } else if (arg === '-h' || arg === '--help') {
        opts.help = true;
    } else if (arg.startsWith('--')) {
        fail(`unknown option ${arg}. ${command('tour.mjs', '--help')} lists them.`);
    } else {
        opts.positional.push(arg);
    }
}

if (opts.help) {
    say(usage(fileURLToPath(import.meta.url)));
    process.exit(0);
}

const surfaces = (() => {
    try {
        return readSurfaces();
    } catch (error) {
        return fail(error.message);
    }
})();

// --- --list -----------------------------------------------------------------------------------

if (opts.list) {
    const ids = tourIds(TOURS);

    if (!ids.length) {
        say(`No tours in ${rel(TOURS)}/ on this branch.`);
    }

    for (const id of ids) {
        try {
            const tour = readTour(TOURS, id);

            say(`${id.padEnd(12)} ${tour.title}  ·  ${tour.steps?.length ?? 0} steps, checked on ${tour.verifiedOn ?? '—'} (${tour.verifiedAt ?? 'never'})`);
        } catch (error) {
            say(`${id.padEnd(12)} ✗ ${error.message.split('\n')[0]}`);
        }
    }

    process.exit(0);
}

// --- --lint (no stack, no browser: CI runs it) ---------------------------------------------------

if (opts.lint) {
    const wanted = opts.positional.length
        ? opts.positional.map((id) => resolveId(TOURS, id) ?? fail(`No tour ${id} in ${rel(TOURS)}/.`))
        : tourIds(TOURS);
    let bad = 0;

    if (!wanted.length) {
        say(`No tours in ${rel(TOURS)}/.`);
    }

    for (const id of wanted) {
        let errors;

        try {
            errors = lint(readTour(TOURS, id), id, { surfaces });
        } catch (error) {
            errors = [`not valid JSON: ${error.message.split('\n')[0]}`];
        }

        bad += errors.length ? 1 : 0;
        say(errors.length ? `✗ ${id}\n${errors.map((e) => `    ${e}`).join('\n')}` : `✓ ${id}`);
    }

    // A folder without its tour.json is a tour half-removed.
    for (const name of existsSync(TOURS) ? readdirSync(TOURS, { withFileTypes: true }) : []) {
        if (name.isDirectory() && !existsSync(join(TOURS, name.name, 'tour.json')) && !opts.positional.length) {
            bad++;
            say(`✗ ${name.name}: a folder without tour.json`);
        }
    }

    process.exit(bad ? 1 : 0);
}

// --- Which tour, and is its code what runs ------------------------------------------------------

const toursPath = rel(TOURS);
const toursIn = (files) => [
    ...new Set(
        files
            .map((f) => f.startsWith(`${toursPath}/`) && f.slice(toursPath.length + 1).match(/^([^/]+)\/tour\.json$/)?.[1])
            .filter(Boolean),
    ),
];
const [target, pick] = opts.positional;
let pr = null;
let id;

if (/^\d+$/.test(target ?? '')) {
    pr = viewPr(target);

    const ids = toursIn(prFiles(pr.number));

    if (!ids.length) {
        fail(`${PR_WORD} #${pr.number} adds or changes no tour. /${config.prefix}:pr-tour ${pr.number} in Claude Code can write one.`);
    }

    id = pick ?? ids[0];

    if (ids.length > 1 && !pick) {
        say(`${PR_WORD} #${pr.number} has tours ${ids.join(', ')}: running ${id} (another: ${command('tour.mjs', `${pr.number} <ID>`)}).`);
    }

    const here = branch();

    if (here !== pr.head) {
        if (dirty()) {
            fail(`You are on ${here || 'a detached HEAD'} with uncommitted changes. Commit or stash them, then run this again: it never stashes for you.`);
        }

        if (!(await ask(`${PR_WORD} #${pr.number} is ${pr.head}; you are on ${here || 'a detached HEAD'}. Check it out?`, true))) {
            fail("Not checked out: the windows would show another branch's code.");
        }

        checkoutPr(pr.number);
    }
} else if (target) {
    if (!isTourId(target)) {
        fail(`"${target}" is neither a tour ID nor a ${PR_WORD} number.`);
    }

    id = target;
} else {
    // No argument: the tour this branch adds or changes (the working tree counts).
    const base = `origin/${config.base}`;
    const changed = sh(['git', 'diff', '--name-only', '--diff-filter=d', base], { allowFail: true });
    const ids = changed === null ? [] : toursIn(changed.split('\n'));

    if (ids.length !== 1) {
        say(usage(fileURLToPath(import.meta.url)));
        say(
            ids.length
                ? `\nThis branch changes ${ids.length} tours (${ids.join(', ')}): name one.`
                : `\nThis branch changes no tour against ${base}. ${command('tour.mjs', '--list')} lists them all.`,
        );
        process.exit(1);
    }

    id = ids[0];
}

const folder = resolveId(TOURS, id);

if (!folder) {
    const file = `${toursPath}/${id}/tour.json`;
    const where = sh(['git', 'log', '--all', '--format=%h %s', '-1', '--', file], { allowFail: true })?.trim();

    fail(`No tour ${id} in this checkout (${file}).${where ? `\n  It is on another branch: ${where}` : ''}`);
}

id = folder;

let tour;

try {
    tour = readTour(TOURS, id);
} catch (error) {
    fail(`${toursPath}/${id}/tour.json is not valid JSON: ${error.message.split('\n')[0]}`);
}

const errors = lint(tour, id, { surfaces });

if (errors.length) {
    fail(`${toursPath}/${id}/tour.json:\n${errors.map((e) => `    ${e}`).join('\n')}`);
}

// --- --markdown: the PR / MR description block -------------------------------------------------

if (opts.markdown) {
    say(markdown(tour, id, { marker: config.prefix, run: command('tour.mjs', id), file: `${toursPath}/${id}/tour.json` }));
    process.exit(0);
}

// --- --check: the steps whose files changed since the tour was checked ----------------------------

if (opts.check) {
    const since = tour.verifiedOn;
    const known = since && sh(['git', 'rev-parse', '--verify', '--quiet', `${since}^{commit}`], { allowFail: true });

    if (!known) {
        say(
            since
                ? `${id}: checked on ${since}, which is not in this clone (a rebase?). Treat every step as unchecked.`
                : `${id}: never checked through (no "verifiedOn"). Treat every step as unchecked.`,
        );
        process.exit(2);
    }

    // Against the working tree: uncommitted changes count too.
    const changed = sh(['git', 'diff', '--name-only', since]).split('\n').filter(Boolean);
    const result = stale(tour, changed);
    let count = 0;

    say(`${tour.title}, checked on ${since} (${tour.verifiedAt ?? 'no date'}). ${changed.length} file${changed.length === 1 ? '' : 's'} changed since.`);

    for (const { index, files } of result.steps) {
        const step = tour.steps[index];

        count += files.length ? 1 : 0;
        say(
            files.length
                ? `  ${index + 1}. stale  ${step.do}\n       ${files.slice(0, 6).join('\n       ')}${files.length > 6 ? `\n       … and ${files.length - 6} more` : ''}`
                : `  ${index + 1}. fresh  ${step.do}`,
        );
    }

    say(
        count
            ? `\n${count} of ${tour.steps.length} steps may be out of date. Run the tour and look closer at those; /${config.prefix}:pr-tour ${id} in Claude Code repairs only those steps.`
            : '\nNothing a step depends on changed: the tour should still hold.',
    );
    process.exit(count ? 2 : 0);
}

// --- Preflight, then the data and the accounts ---------------------------------------------------

mkdirSync(WORK, { recursive: true });
await preflight({ work: WORK });

const accountsFile = join(WORK, `${id}-accounts.json`);
const logins = () => tour.windows.some((w) => w.login);

function prepare() {
    if (!Object.keys(tour.vars ?? {}).length && !logins()) {
        return {};
    }

    if (!runner.prepare) {
        fail(
            `${id} needs data or accounts, and tour/runner.json has no "prepare" command (tour.md §Data). ` +
                `/${config.prefix}:pr-tour ${id} in Claude Code sets it up.`,
        );
    }

    rmSync(accountsFile, { force: true });

    const at = (s) =>
        String(s).replaceAll('{id}', id).replaceAll('{dir}', `${toursPath}/${id}`).replaceAll('{accounts}', rel(accountsFile));
    const cmd = Array.isArray(runner.prepare) ? runner.prepare.map(at) : at(runner.prepare);

    say(`Making the data for ${id}…`);

    const last = sh(cmd).trim().split('\n').filter(Boolean).pop() ?? '';
    let parsed;

    try {
        parsed = JSON.parse(last);
    } catch {
        fail(`${show(cmd)}: its last line is not the JSON {"vars": {…}} (tour.md §Data).`);
    }

    if (existsSync(accountsFile)) {
        chmodSync(accountsFile, 0o600);
    }

    return parsed?.vars ?? parsed ?? {};
}

const vars = prepare();

if (opts.prepare) {
    say(JSON.stringify({ tour: id, vars }, null, 2));

    if (existsSync(accountsFile)) {
        say(`Accounts: ${rel(accountsFile)} (passwords; never print them)`);
    }

    process.exit(0);
}

const filled = fill({ windows: tour.windows, steps: tour.steps }, vars);
const left = leftovers(filled);

if (left.length) {
    fail(`${id} uses ${left.join(', ')}, which its "prepare" did not return.`);
}

if (logins()) {
    const known = readJson(accountsFile) ?? {};
    const missing = filled.windows.filter((w) => w.login && !known[w.login]).map((w) => w.login);

    if (missing.length) {
        fail(`"prepare" wrote no password for ${missing.join(', ')} in ${rel(accountsFile)} (tour.md §Data).`);
    }
}

// Every sign-in page answers, before any window opens.
for (const name of new Set(filled.windows.filter((w) => w.login).map((w) => w.surface))) {
    const surface = surfaces[name];
    const page = `${String(surface.base ?? '').replace(/\/$/, '')}${surface.signin?.path ?? '/'}`;
    const code = surface.base ? await status(page) : 200;

    if (!(code > 0 && code < 400)) {
        fail(`${page} answers ${code || 'nothing'}: is the "${name}" surface up (tour.md §Surfaces)?`);
    }
}

// --- Open the windows and follow the answers -----------------------------------------------------

const stem = join(WORK, id);
const file = `${stem}.json`;

for (const old of readdirSync(WORK).filter((f) => f.startsWith(`${id}-step`) || f === `${id}.log`)) {
    rmSync(join(WORK, old), { force: true });
}

const live = {
    title: tour.title,
    status: 'Ready. Answer each step with ✓ Looks right or ✗ Problem.',
    state: 'ready',
    ...(existsSync(accountsFile) ? { accounts: rel(accountsFile) } : {}),
    shots: rel(WORK),
    ...(tour.i18n ? { i18n: tour.i18n } : {}),
    ...filled,
};
const save = () => writeFileSync(file, `${JSON.stringify(live, null, 4)}\n`);

save();

say(`\n## Tour: ${tour.title}   (the control window on the right guides you)`);
filled.steps.forEach((step, i) => say(`${i + 1}. [${step.window ?? filled.windows[0].name}] ${step.do} ✓ ${step.see}`));
say('Done: close the windows.\n');

const started = startBrowser();
const { bin, args } = launch(join(HERE, 'open.mjs'), ['--tour', rel(file), ...(opts.panel ? ['--panel', opts.panel] : [])]);
const child = spawn(bin, args, { cwd: ROOT, env: { ...process.env, ...(runner.env ?? {}) }, stdio: ['ignore', 'pipe', 'inherit'] });
const answers = {};
const problems = [];
const issues = new Set();
let opened = false;

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

createInterface({ input: child.stdout }).on('line', (line) => {
    if (line.startsWith('problem:')) {
        if (!issues.has(line)) {
            issues.add(line);
            say(`  ! ${mask(line.slice(9))}`);
        }

        return;
    }

    if (!line.startsWith('event: ')) {
        return;
    }

    let event;

    try {
        event = JSON.parse(line.slice(7));
    } catch {
        return;
    }

    if (event.type === 'ready') {
        opened = true;
        say('Windows open.');

        if (process.env.TOUR_HEADLESS === '1') {
            setTimeout(() => child.kill('SIGINT'), 1500);
        }
    } else if (event.type === 'ok') {
        answers[event.step] = 'ok';
        say(`  ✓ ${event.step}`);
    } else if (event.type === 'problem') {
        answers[event.step] = 'problem';
        problems.push(event);
        say(`  ✗ ${event.step}: ${event.text || '(no words)'}${event.shot ? `  (${event.shot})` : ''}`);

        // With --agent, Claude Code answers it. Otherwise nobody watches: note it and move on.
        if (opts.agent) {
            return;
        }

        const last = event.step >= filled.steps.length;

        live.status = last
            ? `Noted step ${event.step}. That was the last step: close the windows for the report.`
            : `Noted step ${event.step}. Go on with step ${event.step + 1}.`;
        live.state = last ? 'done' : 'ready';

        if (!last) {
            live.current = event.step + 1;
        }

        save();
    } else if (event.type === 'done') {
        live.state = 'done';
        live.status = problems.length
            ? `All answered, ${problems.length} problem${problems.length > 1 ? 's' : ''}. Close the windows for the report.`
            : 'All checked. Close the windows.';
        save();
    } else if (event.type === 'error') {
        say(`  ✗ ${mask(event.text ?? '')}`);
    }
});

const code = await new Promise((resolve) => child.on('exit', resolve));

// --- Report -------------------------------------------------------------------------------------

const sha = sh(['git', 'rev-parse', '--short', 'HEAD']).trim();
const total = filled.steps.length;
const ok = Object.values(answers).filter((a) => a === 'ok').length;
const report = mask(
    [
        `## Guided tour ${id}: ${ok} of ${total} steps ✓, ${problems.length} ✗`,
        '',
        `Run with \`${command('tour.mjs', id)}\` on ${sha}${pr ? ` (${PR_WORD} #${pr.number})` : ''}, ${new Date().toISOString().slice(0, 10)}.`,
        '',
        ...filled.steps.map((step, i) => {
            const mark = { ok: '✓', problem: '✗' }[answers[i + 1]] ?? '·';
            const problem = problems.findLast((p) => p.step === i + 1);

            return (
                `${i + 1}. ${mark} [${step.window ?? filled.windows[0].name}] ${step.do}` +
                (problem
                    ? `\n   - **Problem:** ${problem.text || '(no words)'}${problem.shot ? ` (screenshot: \`${problem.shot}\`, local)` : ''}`
                    : '')
            );
        }),
        ...(issues.size ? ['', 'Seen by the script (JS errors, responses ≥ 400):', ...[...issues].map((i) => `- ${i.slice(9)}`)] : []),
    ].join('\n'),
);

writeFileSync(`${stem}-report.md`, `${report}\n`);
say(`\nReport: ${rel(stem)}-report.md`);

if (started && !opts.agent) {
    stopBrowser();
}

if (!opened) {
    fail(`The windows did not open (exit ${code}). See the lines above.`);
}

if (!opts.agent) {
    // The result goes on the PR / MR only when the person asks for it.
    const open = pr ?? currentPr(branch());

    if (open?.state === 'OPEN' && Object.keys(answers).length && (await ask(`Post this result on ${PR_WORD} #${open.number} as a comment?`, false))) {
        writeFileSync(`${stem}-comment.md`, `${report}\n\n_Screenshots stay on the machine that ran the tour._\n`);
        commentPr(open.number, `${stem}-comment.md`);
    }

    // Every step ✓: the tour holds on this commit, which is what --check measures from.
    if (ok === total && (await ask(`All ${total} steps ✓. Mark ${id} as checked on ${sha} (edits its tour.json; you commit it)?`, false))) {
        const path = join(TOURS, id, 'tour.json');
        const raw = readFileSync(path, 'utf8');
        const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? '    ';

        writeFileSync(path, `${JSON.stringify({ ...JSON.parse(raw), verifiedOn: sha, verifiedAt: new Date().toISOString().slice(0, 10) }, null, indent)}\n`);
        say(`${rel(path)}: verifiedOn ${sha}.`);
    }
}

if (problems.length) {
    say(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}: /${config.prefix}:pr-tour ${id} --from-report in Claude Code reads the report and fixes them.`);
}

if (issues.size && !problems.length) {
    warn('The script saw JS errors or failed responses (above): worth a look even though every step passed.');
}

closePrompt();
process.exit(0);
