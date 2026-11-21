#!/usr/bin/env node
// Shows a story playbook's demo without an agent: run-playbook's demo mode as a script, for the part
// scripts in <shared>/playbooks/<story>/ (guided-tour.md and test-playbook.md, next to this folder's
// parent). Managed by /shipkit:forge.
//
//   node <this folder>/present.mjs <story> [parts]     "3" = every part up to 3, "2-4", nothing = all
//   node <this folder>/present.mjs --list
//
// It checks the dev stack (tour/runner.json "preflight"), offers a reset when an earlier run left its
// data on dev (demo.json "reset": you type "reset"), runs the story's setup.mjs (Part 0 as a script:
// the accounts and the base data, safe to run again), starts the tour browser and plays the part
// scripts (part-<N>.mjs) in order. The person drives them from the control window. Every event goes to
// <workspace>/run.log; the terminal shows only failed steps, ✗ answers and notes, then the "Demo ready"
// block (demo.json: "title", "signIn", "startAt", "base" or "surface").
// Options: --rehearse (✓ / ✗ after every step, and a line for each "look" ring that finds nothing: for
// checking a part script), --skip-setup. The workspace is run-playbook's (.claude/.tmp/qa-<story>/, or
// DEMO_WS), so a demo the agent started can go on here, and back.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { mask } from './demo.mjs';
import {
    ROOT,
    SHARED,
    TMP,
    ask,
    closePrompt,
    command,
    config,
    fail,
    launch,
    preflight,
    readJson,
    rel,
    runner,
    say,
    sh,
    show,
    startBrowser,
    stopBrowser,
    text,
    usage,
    warn,
} from './stack.mjs';
import { readSurfaces } from './surfaces.mjs';

const PLAYBOOKS = join(SHARED, 'playbooks');

process.chdir(ROOT);

// --- Arguments --------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const words = argv.filter((a) => !a.startsWith('--'));
const partsOf = (story) =>
    readdirSync(join(PLAYBOOKS, story))
        .map((f) => f.match(/^part-(\d+)\.mjs$/)?.[1])
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b);
const stories = existsSync(PLAYBOOKS)
    ? readdirSync(PLAYBOOKS, { withFileTypes: true })
          .filter((d) => d.isDirectory() && partsOf(d.name).length)
          .map((d) => d.name)
    : [];
const configOf = (story) => readJson(join(PLAYBOOKS, story, 'demo.json')) ?? {};

for (const flag of flags) {
    if (!['--list', '--help', '--rehearse', '--skip-setup'].includes(flag)) {
        fail(`unknown option ${flag}. ${command('present.mjs', '--help')} lists them.`);
    }
}

if (flags.has('--help')) {
    say(usage(fileURLToPath(import.meta.url)));
    process.exit(0);
}

if (flags.has('--list')) {
    if (!stories.length) {
        say(`No story with part scripts in ${rel(PLAYBOOKS)}/.`);
    }

    for (const story of stories) {
        const parts = partsOf(story);

        say(`${story.padEnd(24)} ${configOf(story).title ?? ''}  ·  parts ${parts[0]}–${parts.at(-1)}${existsSync(join(PLAYBOOKS, story, 'setup.mjs')) ? '' : '  (no setup.mjs)'}`);
    }

    process.exit(0);
}

// "story 2-4" or "2-4 story": the parts are the word made of digits.
const range = words.find((w) => /^\d+(-\d+)?$/.test(w));
const story = words.find((w) => w !== range) ?? (stories.length === 1 ? stories[0] : null);

if (!story) {
    fail(stories.length ? `Name a story: ${stories.join(', ')}.` : `No story with part scripts in ${rel(PLAYBOOKS)}/ (test-playbook.md §Story playbooks).`);
}

if (!stories.includes(story)) {
    fail(`No story "${story}" with part scripts. There are: ${stories.join(', ') || 'none'}.`);
}

const dir = join(PLAYBOOKS, story);
const demo = configOf(story);
const all = partsOf(story);
const [from, to] = range
    ? range.includes('-')
        ? range.split('-').map(Number)
        : [all[0], Number(range)]
    : [all[0], all.at(-1)];
const parts = all.filter((n) => n >= from && n <= to);

if (!parts.length || from > to) {
    fail(`${story} has parts ${all.join(', ')}; "${range}" picks none of them.`);
}

const at = (path) => resolve(ROOT, path);
const ws = at(process.env.DEMO_WS ?? join(TMP, `qa-${story}`));
const env = {
    DEMO_WS: ws,
    DEMO_EV: at(process.env.DEMO_EV ?? join(ws, 'evidence')),
    DEMO_ACCOUNTS: at(process.env.DEMO_ACCOUNTS ?? join(ws, 'accounts.json')),
    ...(flags.has('--rehearse') ? { DEMO_REHEARSE: '1' } : {}),
};
const varsFile = join(ws, 'vars.json');
const log = join(ws, 'run.log');

mkdirSync(ws, { recursive: true });

// --- The stack, and the data an earlier run left ---------------------------------------------------

await preflight({ work: ws });

if (from === all[0]) {
    if (existsSync(varsFile)) {
        say('An earlier run of this story left its data on dev: the parts still run, with new ids and codes.');

        // A list of commands, each an array or a string.
        const reset = Array.isArray(demo.reset) ? demo.reset : [];

        if (reset.length) {
            const answer = await text(`Type "reset" to wipe the dev data and seed it again (${reset.map(show).join(' && ')}), or press Enter to go on:`);

            if (answer === 'reset') {
                for (const cmd of reset) {
                    say(`→ ${show(cmd)}`);
                    sh(cmd, { quiet: false });
                }
            }
        }
    }

    // The first part starts the story again: the ids an earlier run saved belong to other records.
    rmSync(varsFile, { force: true });
} else if (from < (demo.standaloneFrom ?? Infinity) && !existsSync(varsFile)) {
    fail(`Part ${from} needs the data of the parts before it (${rel(varsFile)}, from an earlier run on this database). Start at part ${all[0]}.`);
}

// --- Setup, then the parts -------------------------------------------------------------------------

writeFileSync(log, '');

function node(script, args, onEvent) {
    const { bin, args: full } = launch(script, args);
    const child = spawn(bin, full, { cwd: ROOT, env: { ...process.env, ...(runner.env ?? {}), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    const stop = (signal) => child.kill(signal);

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    createInterface({ input: child.stdout }).on('line', (line) => {
        appendFileSync(log, `${mask(line)}\n`);

        try {
            onEvent(JSON.parse(line));
        } catch {
            // Not an event: a plain line from the script.
        }
    });

    return new Promise((done) =>
        child.on('exit', (code) => {
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
            done(code);
        }),
    );
}

const setup = join(dir, 'setup.mjs');

if (flags.has('--skip-setup')) {
    say('Setup skipped.');
} else if (existsSync(setup)) {
    say('Preparing the data…');

    const failed = [];
    const exit = await node(setup, [], (event) => {
        if (event.type !== 'setup') {
            return;
        }

        if (event.state === 'failed') {
            failed.push(event.item);
            say(`  ✗ ${event.item}: ${mask(event.why ?? 'failed')}`);
        } else {
            say(`  ✓ ${event.item}${event.state === 'already' ? ' (already)' : ''}`);
        }
    });

    if ((exit !== 0 || failed.length) && !(await ask('Part of the setup failed. Play the demo anyway?', false))) {
        fail(`Stopped. The lines above say what failed; every event is in ${rel(log)}.`);
    }
} else if (!existsSync(env.DEMO_ACCOUNTS)) {
    warn(
        `${rel(dir)} has no setup.mjs and there is no accounts file (${rel(env.DEMO_ACCOUNTS)}): parts that sign in will fail. ` +
            `Run /${config.prefix}:run-playbook ${story} ${to} demo once in Claude Code, or add setup.mjs (test-playbook.md §Story playbooks).`,
    );
}

say(`\nPlaying ${demo.title ?? story}, parts ${parts.join(', ')}. The control window on the right drives it; this terminal shows only what goes wrong.`);

const started = startBrowser();
const broken = [];
let reached = null;
let closed = false;

for (const n of parts) {
    const code = await node(join(dir, `part-${n}.mjs`), [], (event) => {
        if (event.type === 'step' && event.mark === '❌') {
            broken.push(`${event.step}: ${event.note}`);
            say(`  ❌ ${event.step}: ${mask(event.note ?? '')}`);
        } else if (event.type === 'error') {
            broken.push(`${event.step ?? `part ${n}`}: ${event.message}`);
            say(`  ❌ ${event.step ?? `part ${n}`}: ${mask(event.message ?? '')}${event.shot ? `  (${event.shot})` : ''}`);
        } else if (event.type === 'verdict' && event.verdict !== '✓') {
            broken.push(`${event.step}: ✗ ${event.text ?? ''}`);
            say(`  ✗ ${event.step}: ${event.text ?? ''}${event.shot ? `  (${event.shot})` : ''}`);
        } else if (event.type === 'look' && event.found === null && flags.has('--rehearse')) {
            // A rehearsal is where a part script gets checked: a "look" ring that finds nothing is its to fix.
            say(`  ⌖ ${event.step}: the "look" ring finds nothing for "${event.spec}"`);
        } else if (event.type === 'problem') {
            say(`  ✎ ${event.step ?? ''}: ${event.text}`);
        } else if (event.type === 'closed') {
            closed = true;
            say(`  The windows were closed${event.reason ? ` (${event.reason})` : ''}: the run stopped.`);
        }
    });

    if (code !== 0) {
        if (!closed) {
            broken.push(`part ${n}: the script stopped (exit ${code})`);
        }

        break;
    }

    reached = n;
}

closePrompt();

if (started) {
    stopBrowser();
}

// --- Where things are -----------------------------------------------------------------------------

const vars = readJson(varsFile) ?? {};
const base = String(demo.base ?? (demo.surface ? readSurfaces()[demo.surface]?.base : '') ?? '').replace(/\/$/, '');
const startAt = Object.entries(demo.startAt ?? {})
    .map(([label, path]) => [label, String(path).replace(/\{([A-Z][A-Z0-9_]*)\}/g, (all, key) => vars[key] ?? all)])
    .filter(([, path]) => !/\{[A-Z][A-Z0-9_]*\}/.test(path))
    .map(([label, path]) => `${label} ${/^https?:\/\//.test(path) ? path : `${base}${path}`}`);
const last = all.at(-1);

say(`\n## Demo ${reached === null ? 'stopped' : 'ready'} — ${demo.title ?? story} · up to Part ${reached ?? '—'}`);
say(`State: ${Object.entries(vars).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ') || 'no ids saved'}`);
say(`Sign in: ${demo.signIn ?? `the story's accounts; passwords in ${rel(env.DEMO_ACCOUNTS)}, never printed`}`);

if (startAt.length) {
    say(`Start at: ${startAt.join(' · ')}`);
}

say(`Did not work: ${broken.length ? mask(broken.join('; ')) : 'nothing'}`);
say(
    `Later: ${reached !== null && reached < last ? `the next parts with ${command('present.mjs', `${story} ${reached + 1}-${last}`)}` : reached === last ? 'that was the last part' : `start again with ${command('present.mjs', story)}`}` +
        ` · put dev back: the playbook's *Put dev back* part`,
);
say(`Every event: ${rel(log)}`);
process.exit(closed || reached !== null ? 0 : 1);
