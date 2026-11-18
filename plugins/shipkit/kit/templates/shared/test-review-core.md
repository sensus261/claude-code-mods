# Test review core

## Find existing tests

Where tests live, how they are named and which shared fixtures and fakes exist:
`review-rules.md` §Tests. Naming is never strict, so always grep too:

```bash
grep -rln "<module or import path>" <test dirs>
grep -rn "<ClassOrFunction>" <test dirs>
```

## Checklist A: missing coverage

- New feature or behavior with no happy-path test.
- New error path, refusal or limit with no test at the limit.
- New state, transition, permission or role with no case for it (allowed **and** refused).
- New background job, queue consumer or scheduled task: a duplicate trigger, a retry and the
  per-item failure path.
- New route, action or command: its success, its validation errors and its authorization.
- Schema change: a test exercises the new column or table.
- Safety-relevant setting: its default is asserted.
- The project's own must-cover list: `review-rules.md` §Tests.

## Checklist B: tests needing adaptation

- Tests still asserting the old behavior, signature or copy.
- Fakes, mocks or stubs that drifted from the real interface (new methods or arguments).
- Seed data and factories missing new required fields or states.
- *(branch)* Tests added earlier on the branch that later commits invalidated.

## Checklist C: convention violations

- Real network access, real credentials or a real inbox in a test.
- Wall-clock or sleep dependence where an injected clock would do.
- Asserting implementation details instead of behavior; one giant test covering many behaviors.
- A test in the wrong suite (it needs a database, a browser or a service but isn't marked so).
- The project's own conventions: `review-rules.md` §Tests.

## Checklist D: suite classification

The suites, their markers or folders and the command that runs each: `review-rules.md` §Tests
and `local-gate.md` §Gate.

- New test in the right suite.
- *(branch)* Every suite relevant to the branch's areas was run, not just the changed files.
