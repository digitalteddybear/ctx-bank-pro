# Termination candidates — review only

No code or content deleted. Missing static references do not prove non-use.

| Candidate | Evidence | Classification | Required check before removal |
| --- | --- | --- | --- |
| Unused named imports in agents-view, agent-os-tracker-view, knowledge-app, shell-side-navigation, layout, QA scripts | Baseline ESLint reports 58 unused bindings | Safe removal candidate, high confidence for named specifiers only | Preserve side-effect imports; typecheck and visual baseline |
| knowledge-app navItems and unused helper branches in agents-view | ESLint flags unused declarations | Consolidation candidate | Check module initialization side effects and remove only unreachable bindings |
| Old static fixture assertions in mission-control-browser-qa | Assertions reference removed attachment chips | Replace assertions, retain test purpose | Verify current live upload and navigation flow |
| Standalone Astryx demo routes | Reachable routes exist even if absent from primary nav | Retain pending evidence | Confirm catalogue/documentation/direct-link consumers before any removal |
| FixtureModel and synthetic sources | Required by 24 passing outreach tests and demo paths | Retain | Keep explicitly isolated from production |
| live-demo and live-email scripts | Real transport consumers; may be operator workflows | Retain pending evidence | Migrate operator use to durable worker before deprecation |
| Generated/runtime databases, lead corpus, migrations, approval history | Operational data and recovery state | Retain | Never treat as dead code |
| LangSmith integration | Recent user working-tree changes | Retain | Review redaction and ownership with contingency handoff |

Dependency removal is not approved: no package has yet been demonstrated unused across scripts, dynamic imports, build tooling, and operational commands. UI/functionality parity is required for any later cleanup.
