const activeWorkspaceRuns = new Map<string, AbortController>();
export function registerWorkspaceRun(runId: string, controller: AbortController) { activeWorkspaceRuns.set(runId, controller); }
export function finishWorkspaceRun(runId: string) { activeWorkspaceRuns.delete(runId); }
export function cancelWorkspaceRun(runId: string) { const controller = activeWorkspaceRuns.get(runId); if (!controller) return false; controller.abort(); return true; }
