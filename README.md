# claude-code-mods

Two small mods for the Claude Code terminal UI. Install either one alone, or both.

| Mod | What it does |
| --- | --- |
| `usage-meter` | A row above the prompt with your session (5h) and weekly plan usage as bars, with the time until each resets. `/limits` opens a pane with pace, a hit-the-limit forecast, context and session cost. |
| `working-critter` | A tiny pixel critter trots at the top-right of the screen while Claude is working. Terminal only. |

`usage-meter` shows plan limits only on a Claude subscription, and only after the first reply.
`working-critter` pins to the top-right in fullscreen mode (`"tui": "fullscreen"`). In the inline layout it hangs one row above the working label instead.

## Install

At the prompt of a terminal session:

```
/plugin install usage-meter --marketplace sensus261/claude-code-mods
/plugin install working-critter --marketplace sensus261/claude-code-mods
```

From a shell:

```
claude plugin install usage-meter --marketplace sensus261/claude-code-mods
claude plugin install working-critter --marketplace sensus261/claude-code-mods
```

The first time, answer `y` to "Add marketplace?", then pick the user scope so the mod loads in every session. Once installed it is active at once, with no restart.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `sensus261/claude-code-mods`, then Add plugin.

## Update

```
claude plugin marketplace update claude-code-mods
```

## Layout

```
.claude-plugin/marketplace.json     lists both mods
plugins/usage-meter/                hooks/register.tsx, types/ (state contract), tests
plugins/working-critter/            hooks/register.tsx, tests
```

Each mod is a self-contained hooks module: `hooks/hooks.json` points at `hooks/register.tsx`.

## Develop

Load a mod from its folder for one session:

```
claude --plugin-dir plugins/usage-meter
```

Saving a file reloads it. Check and test it:

```
claude plugin validate plugins/usage-meter
claude plugin test plugins/usage-meter
```

## Tuning

`working-critter`: if the critter sits a row too low, lower `ROWS_BELOW_SPINNER` in `plugins/working-critter/hooks/register.tsx`. If it loses its top half off the screen, raise it.
