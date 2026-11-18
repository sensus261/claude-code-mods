#!/usr/bin/env bash
# The browser of the guided tour (guided-tour.md, next to this folder). It starts a separate
# Chromium-family browser with its own empty profile and the DevTools port open on 127.0.0.1;
# `open.mjs` drives it over that port (from the host, or from a container through
# host.docker.internal). Managed by /shipkit:forge.
#
#   <this folder>/chrome.sh          start it, or reuse the one already up
#   <this folder>/chrome.sh status   say whether it is up
#   <this folder>/chrome.sh stop     quit it (only this profile's browser, never yours)
#
# Settings: TOUR_CDP_PORT (default 9222), TOUR_CHROME_PROFILE (default .claude/.tmp/tour-chrome,
# ignored by git), TOUR_BROWSER (macOS: an app name such as "Google Chrome", "Chromium",
# "Brave Browser", "Microsoft Edge"; Linux: a binary name or path), TOUR_HEADLESS=1 (no window on
# screen: for testing the tour scripts themselves).
# The profile holds no account: every tour window is a fresh, cookie-less browser context.
set -euo pipefail

port="${TOUR_CDP_PORT:-9222}"
root="$(cd "$(dirname "$0")/../../.." && pwd)"
profile="${TOUR_CHROME_PROFILE:-$root/.claude/.tmp/tour-chrome}"
flags=(
    --remote-debugging-port="$port"
    --user-data-dir="$profile"
    --no-first-run
    --no-default-browser-check
    --disable-features=Translate
)
if [ -n "${TOUR_HEADLESS:-}" ]; then
    flags+=(--headless=new)
fi

up() {
    curl -fsS --max-time 1 "http://127.0.0.1:$port/json/version" >/dev/null 2>&1
}

# The browser's main process for this profile (helpers carry --type=).
main_pid() {
    pgrep -f -- "--user-data-dir=$profile" | while read -r pid; do
        if ! ps -o command= -p "$pid" | grep -q -- '--type='; then
            echo "$pid"
        fi
    done | sed -n 1p
}

launch() {
    mkdir -p "$profile"
    if [ "$(uname -s)" = "Darwin" ]; then
        local app="${TOUR_BROWSER:-}"
        if [ -z "$app" ]; then
            for candidate in "Google Chrome" "Chromium" "Brave Browser" "Microsoft Edge"; do
                if open -Ra "$candidate" 2>/dev/null; then
                    app="$candidate"
                    break
                fi
            done
        fi
        if [ -z "$app" ]; then
            echo "problem: no Chromium-family browser found (Google Chrome, Chromium, Brave, Edge); set TOUR_BROWSER" >&2
            exit 1
        fi
        # Chrome 136+ opens the DevTools port only with a profile other than the default one.
        open -na "$app" --args "${flags[@]}" about:blank
        echo "$app"
    else
        local bin="${TOUR_BROWSER:-}"
        if [ -z "$bin" ]; then
            for candidate in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
                if command -v "$candidate" >/dev/null 2>&1; then
                    bin="$candidate"
                    break
                fi
            done
        fi
        if [ -z "$bin" ]; then
            echo "problem: no Chromium-family browser found (google-chrome, chromium, brave-browser, microsoft-edge); set TOUR_BROWSER" >&2
            exit 1
        fi
        nohup "$bin" "${flags[@]}" about:blank >/dev/null 2>&1 &
        echo "$bin"
    fi
}

case "${1:-start}" in
start)
    if up; then
        echo "ready: tour browser already up on 127.0.0.1:$port"
        exit 0
    fi
    name="$(launch)"
    for _ in $(seq 1 40); do
        if up; then
            echo "ready: $name on 127.0.0.1:$port (profile $profile)"
            exit 0
        fi
        sleep 0.25
    done
    echo "problem: $name started but its DevTools port $port did not answer" >&2
    exit 1
    ;;
status)
    if up; then
        echo "up: 127.0.0.1:$port"
    else
        echo "down"
    fi
    ;;
stop)
    pid="$(main_pid || true)"
    if [ -z "$pid" ]; then
        echo "stopped: no tour browser running"
        exit 0
    fi
    kill "$pid"
    for _ in $(seq 1 20); do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "stopped"
            exit 0
        fi
        sleep 0.25
    done
    echo "problem: the tour browser (pid $pid) is still running" >&2
    exit 1
    ;;
*)
    echo "Usage: $0 [start|status|stop]" >&2
    exit 1
    ;;
esac
