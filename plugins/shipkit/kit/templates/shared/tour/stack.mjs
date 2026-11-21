// What the agent-free runners share (tour.mjs and present.mjs, next to this file; guided-tour.md): the
// toolkit's choices (shipkit.json), shell calls, yes / no prompts, the dev stack's preflight from
// tour/runner.json, the tour browser (chrome.sh), and the few git host calls they make (GitHub `gh` or
// GitLab `glab`, as shipkit.json says). Managed by /shipkit:forge.
//
// tour/runner.json is the project's (written by /shipkit:forge; tour.md §Runner and §Data say it in words):
//   { "launch": ["node"],                          how a tour script runs: on the host, or with a container prefix
//     "env": { "TOUR_PLAYWRIGHT": "web" },         added to the environment of every script and command it runs
//     "prepare": ["<cmd>", "{id}", "--accounts", "{accounts}"],
//     "preflight": [{ "what": "…", "url" | "cmd": …, "match", "noMatch", "start" | "fix", "ask", "default",
//                     "wait", "optional", "hint", "run" }] }
// A command is an array (run as is) or a string (run with sh -c), from the repo root.
// "prepare" makes a tour's data and accounts; it runs for a tour that has vars or signs in. {id} is the
// tour's ID, {dir} its folder, {accounts} the accounts file it writes ({"<login>": "<password>"}, a path
// from the repo root). Its last output line is JSON, {"vars": {"<NAME>": <value>}}. It never prints a
// password.
// A preflight step checks a "url" (it answers below 400) or a "cmd" (it exits 0; "match" / "noMatch":
// a regular expression its output must, or must not, match). When the check fails, "start" starts a
// command in the background and waits for the check (up to "wait" seconds, default 60), "fix" runs one
// in the foreground; both ask first ("ask"; "default": the answer without a terminal, yes for start, no
// for fix). Declined, or neither: "optional" warns and goes on, otherwise it stops with "hint". "run"
// (alone, or after the check) always runs, e.g. a worker restart; its failure only warns.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { HERE, ROOT } from './tour-control.mjs';

export { HERE, ROOT };
export const SHARED = join(HERE, '..');
export const TMP = join(ROOT, '.claude/.tmp');
export const rel = (file) => relative(ROOT, file) || '.';

export const say = (line = '') => console.log(line);
export const warn = (line) => console.log(`! ${line}`);

export function fail(line) {
    console.error(`✗ ${line}`);
    process.exit(1);
}

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function readJson(file) {
    if (!existsSync(file)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        fail(`cannot read ${rel(file)}: ${error.message.split('\n')[0]}`);
    }
}

// The toolkit's choices: prefix, base branch, git host.
export const config = { prefix: 'tour', base: 'main', host: 'github', ...readJson(join(SHARED, 'shipkit.json')) };
// The project's runner (above); {} when it has none yet.
export const runner = readJson(join(HERE, 'runner.json')) ?? {};
export const scriptEnv = () => ({ ...process.env, ...(runner.env ?? {}) });

// --- Commands -----------------------------------------------------------------------------------

export const show = (cmd) => (Array.isArray(cmd) ? cmd.join(' ') : String(cmd));
const argvOf = (cmd) => (Array.isArray(cmd) ? cmd : ['sh', '-c', String(cmd)]);

// A command's stdout; on failure, its last lines (or null with allowFail).
export function sh(cmd, { quiet = true, allowFail = false } = {}) {
    const [file, ...args] = argvOf(cmd);

    try {
        return (
            execFileSync(file, args, {
                cwd: ROOT,
                encoding: 'utf8',
                stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
                env: scriptEnv(),
                maxBuffer: 64 * 1024 * 1024,
            }) ?? ''
        );
    } catch (error) {
        if (allowFail) {
            return null;
        }

        const detail = String(error.stderr || error.stdout || error.message)
            .trim()
            .split('\n')
            .slice(-6)
            .join('\n');

        fail(`${show(cmd)} failed:\n${detail}`);
    }
}

// How a tour script starts (runner.json "launch", default the Node running this), with its arguments.
export function launch(script, args = []) {
    const prefix = typeof runner.launch === 'string' ? runner.launch.split(/\s+/).filter(Boolean) : runner.launch;
    const [bin, ...pre] = prefix?.length ? prefix : ['node'];

    return {
        bin: bin === 'node' && pre.length === 0 ? process.execPath : bin,
        args: [...pre, rel(script), ...args],
    };
}

// The command a person types for a runner: the package.json script that runs it, else node.
export function command(script, args = '') {
    const scripts = readJson(join(ROOT, 'package.json'))?.scripts ?? {};
    const name = Object.entries(scripts).find(([, v]) => typeof v === 'string' && v.includes(`tour/${script}`))?.[0];

    if (name) {
        return args ? `npm run ${name} -- ${args}` : `npm run ${name}`;
    }

    return `node ${rel(join(HERE, script))}${args ? ` ${args}` : ''}`;
}

// The help text of a runner: its header comment.
export function usage(file) {
    return readFileSync(file, 'utf8')
        .split('\n')
        .slice(1)
        .filter((line, i, all) => all.slice(0, i + 1).every((l) => l.startsWith('//')))
        .map((line) => line.replace(/^\/\/ ?/, ''))
        .join('\n');
}

// --- Prompts ------------------------------------------------------------------------------------

let prompt = null;
let muted = false;

function terminal() {
    if (!process.stdin.isTTY) {
        return null;
    }

    // An output that can be silenced, for a password.
    const output = new Writable({
        write(chunk, encoding, done) {
            if (!muted) {
                process.stdout.write(chunk, encoding);
            }

            done();
        },
    });

    prompt ??= createInterface({ input: process.stdin, output, terminal: true });

    return prompt;
}

// A line of text, or null without a terminal (a pipe, CI). `secret` does not echo it.
export async function text(question, { secret = false } = {}) {
    const rl = terminal();

    if (!rl) {
        return null;
    }

    const pending = rl.question(`${question} `);

    muted = secret;

    const answer = await pending;

    if (secret) {
        muted = false;
        process.stdout.write('\n');
    }

    return answer.trim();
}

// A yes / no question. Without a terminal the default answers.
export async function ask(question, yesByDefault) {
    const answer = await text(`${question} ${yesByDefault ? '[Y/n]' : '[y/N]'}`);

    if (answer === null || answer === '') {
        return yesByDefault;
    }

    return answer.toLowerCase().startsWith('y');
}

export function closePrompt() {
    prompt?.close();
    prompt = null;
}

// --- The dev stack ------------------------------------------------------------------------------

export async function status(url) {
    try {
        return (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })).status;
    } catch {
        return 0;
    }
}

async function passes(step) {
    if (step.url) {
        const code = await status(step.url);

        return code > 0 && code < 400;
    }

    if (step.cmd) {
        const out = sh(step.cmd, { allowFail: true });

        return (
            out !== null &&
            (!step.match || new RegExp(step.match, 'm').test(out)) &&
            (!step.noMatch || !new RegExp(step.noMatch, 'm').test(out))
        );
    }

    return true;
}

async function repair(step, what, work) {
    const how = step.start ?? step.fix;

    if (how && (await ask(step.ask ?? `${what}: not ready. Run \`${show(how)}\`?`, step.default ?? Boolean(step.start)))) {
        if (step.start) {
            mkdirSync(work, { recursive: true });

            const log = join(work, `${what.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.log`);
            const fd = openSync(log, 'a');
            const [bin, ...args] = argvOf(step.start);

            spawn(bin, args, { cwd: ROOT, env: scriptEnv(), detached: true, stdio: ['ignore', fd, fd] }).unref();

            for (let i = 0; i < (step.wait ?? 60); i++) {
                if (await passes(step)) {
                    say(`✓ ${what}: started (log: ${rel(log)}; it keeps running)`);

                    return;
                }

                await sleep(1000);
            }

            fail(`${what}: started, but still not ready after ${step.wait ?? 60} s. See ${rel(log)}.`);
        }

        sh(step.fix, { quiet: false });

        if (await passes(step)) {
            say(`✓ ${what}`);

            return;
        }

        fail(`${what}: still not ready after \`${show(step.fix)}\`.`);
    }

    if (step.optional) {
        warn(`${what}: not ready${step.hint ? ` (${step.hint})` : ''}. Going on.`);

        return;
    }

    fail(`${what}: not ready.${step.hint ? ` ${step.hint}` : ''}`);
}

// Runs runner.json's preflight, in order. `work` holds the logs of what it starts.
export async function preflight({ work = join(TMP, 'tour') } = {}) {
    if (!runner.preflight?.length) {
        warn('tour/runner.json has no "preflight": the dev stack is not checked (tour.md §Runner).');
    }

    for (const step of runner.preflight ?? []) {
        const what = step.what ?? show(step.cmd ?? step.url ?? step.run);

        if ((step.url || step.cmd) && !(await passes(step))) {
            await repair(step, what, work);
        }

        if (step.run && sh(step.run, { allowFail: true }) === null) {
            warn(`${what}: \`${show(step.run)}\` failed.`);
        }
    }
}

// --- The tour browser ---------------------------------------------------------------------------

const CHROME = join(HERE, 'chrome.sh');

// Starts the tour browser unless it is up (or TOUR_CDP points at another one). True when it started
// it, so the caller stops it at the end.
export function startBrowser() {
    if (process.env.TOUR_CDP) {
        return false;
    }

    if (/^up/.test(sh([CHROME, 'status'], { allowFail: true }) ?? '')) {
        return false;
    }

    say(sh([CHROME]).trim());

    return true;
}

export function stopBrowser() {
    sh([CHROME, 'stop'], { allowFail: true });
}

// --- The git host -------------------------------------------------------------------------------

const GITLAB = config.host === 'gitlab';
const STATES = { opened: 'OPEN', merged: 'MERGED', closed: 'CLOSED', locked: 'CLOSED' };
const fromGitlab = (mr) => ({
    number: mr.iid,
    title: mr.title,
    state: STATES[mr.state] ?? String(mr.state).toUpperCase(),
    head: mr.source_branch,
    url: mr.web_url,
});
const fromGithub = (pr) => ({ number: pr.number, title: pr.title, state: pr.state, head: pr.headRefName, url: pr.url });

// A PR / MR by number: { number, title, state: OPEN | MERGED | CLOSED, head, url }.
export function viewPr(number) {
    return GITLAB
        ? fromGitlab(JSON.parse(sh(['glab', 'mr', 'view', String(number), '-F', 'json'])))
        : fromGithub(JSON.parse(sh(['gh', 'pr', 'view', String(number), '--json', 'number,title,state,headRefName,url'])));
}

// The open PR / MR of `branch`, or null.
export function currentPr(branch) {
    if (!branch) {
        return null;
    }

    if (GITLAB) {
        const list = sh(['glab', 'mr', 'list', '--source-branch', branch, '-F', 'json'], { allowFail: true });

        return list ? (JSON.parse(list).map(fromGitlab)[0] ?? null) : null;
    }

    const pr = sh(['gh', 'pr', 'view', branch, '--json', 'number,title,state,headRefName,url'], { allowFail: true });

    return pr ? fromGithub(JSON.parse(pr)) : null;
}

// The files a PR / MR changes, from git (the head is fetched, nothing is checked out).
export function prFiles(number) {
    const ref = GITLAB ? `merge-requests/${number}/head` : `pull/${number}/head`;

    sh(['git', 'fetch', '-q', 'origin', config.base]);
    sh(['git', 'fetch', '-q', 'origin', ref]);

    return sh(['git', 'diff', '--name-only', '--diff-filter=d', `origin/${config.base}...FETCH_HEAD`])
        .split('\n')
        .filter(Boolean);
}

export function checkoutPr(number) {
    sh(GITLAB ? ['glab', 'mr', 'checkout', String(number)] : ['gh', 'pr', 'checkout', String(number)], { quiet: false });
}

// Posts the file as a comment on the PR / MR (asked first by the caller).
export function commentPr(number, file) {
    sh(
        GITLAB
            ? ['glab', 'api', `projects/:fullpath/merge_requests/${number}/notes`, '-F', `body=@${file}`]
            : ['gh', 'pr', 'comment', String(number), '--body-file', file],
        { quiet: false },
    );
}

export const PR_WORD = GITLAB ? 'MR' : 'PR';
export const branch = () => (sh(['git', 'branch', '--show-current'], { allowFail: true }) ?? '').trim();
export const dirty = () => Boolean((sh(['git', 'status', '--porcelain', '--untracked-files=no'], { allowFail: true }) ?? '').trim());
