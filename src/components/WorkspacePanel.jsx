import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, TerminalSquare, Network, ListTodo,
  Play, Square, RotateCcw, Loader2, Hammer, Package, CheckCircle2, AlertCircle, Server, Rocket, ExternalLink,
} from 'lucide-react';
import { useStore } from '../store';
import { detectWorkspaceKind } from '../lib/workspace';
import { logCollabEvent } from '../lib/collaboration';

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sanitizeDeploymentSlug(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function TaskButton({ icon: Icon, label, onClick, disabled, subtle = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
        subtle
          ? 'border-border text-muted hover:text-white hover:border-border-light'
          : 'border-white/10 bg-white text-black hover:bg-white/90'
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function RuntimeStatusBadge({ status }) {
  const map = {
    running: 'bg-emerald-500/15 text-emerald-300',
    starting: 'bg-sky-500/15 text-sky-300',
    stopping: 'bg-amber-500/15 text-amber-300',
    error: 'bg-red-500/15 text-red-300',
    stopped: 'bg-white/5 text-muted',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status] || map.stopped}`}>
      {status || 'unknown'}
    </span>
  );
}

function LogLine({ entry }) {
  const streamClass = entry.stream === 'stderr'
    ? 'text-red-300'
    : entry.stream === 'system'
    ? 'text-sky-300'
    : 'text-zinc-200';
  return (
    <div className="border-b border-white/5 px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-muted">
        <span>{entry.stream}</span>
        <span>{formatTime(entry.ts)}</span>
      </div>
      <pre className={`mt-1 whitespace-pre-wrap text-[11px] leading-5 ${streamClass}`}>{entry.message}</pre>
    </div>
  );
}

export default function WorkspacePanel({ workspaceId, files, projectTitle }) {
  const { notify, user, project } = useStore();
  const [tab, setTab] = useState('runtime');
  const [runtime, setRuntime] = useState(null);
  const [tasks, setTasks] = useState({ active: null, history: [] });
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [deploySlug, setDeploySlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const workspaceKind = useMemo(() => detectWorkspaceKind(files), [files]);
  const reactProject = workspaceKind.kind === 'react' || workspaceKind.kind === 'vite';
  const packageProject = workspaceKind.packageProject;
  const canPathDeploy = workspaceKind.kind === 'static' || workspaceKind.kind === 'react' || workspaceKind.kind === 'vite';
  const suggestedSlug = useMemo(() => sanitizeDeploymentSlug(projectTitle || workspaceId || 'project'), [projectTitle, workspaceId]);

  const loadState = useCallback(async () => {
    if (!workspaceId) return;
    const [runtimeResponse, deploymentsResponse] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}/runtime/status`),
      fetch(`/api/workspaces/${workspaceId}/deployments`),
    ]);

    const runtimeData = await runtimeResponse.json();
    if (!runtimeResponse.ok) throw new Error(runtimeData.error || 'Unable to read workspace state.');

    const deploymentData = await deploymentsResponse.json();
    if (!deploymentsResponse.ok) throw new Error(deploymentData.error || 'Unable to read deployments.');

    setRuntime(runtimeData.runtime);
    setTasks(runtimeData.tasks || { active: null, history: [] });
    setDeployments(deploymentData.deployments || []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (slugTouched) return;
    setDeploySlug(suggestedSlug);
  }, [suggestedSlug, slugTouched]);

  useEffect(() => {
    loadState().catch((error) => {
      setLoading(false);
      notify(error.message, 'error');
    });
  }, [loadState, notify]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    const timer = setInterval(() => {
      loadState().catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [workspaceId, loadState]);

  const runRuntimeAction = async (action) => {
    setPendingAction(action);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/runtime/${action}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Unable to ${action} runtime.`);
      setRuntime(data.runtime);
      if (project?.id && user && !user.isGuest) {
        await logCollabEvent(project.id, user, 'runtime.action', {
          action,
          framework: data.runtime?.frameworkLabel || workspaceKind.label,
          port: data.runtime?.port || null,
        }).catch(() => {});
      }
      notify(
        action === 'start' ? 'Workspace runtime started' :
        action === 'stop' ? 'Workspace runtime stopped' :
        'Workspace runtime restarted',
        'success'
      );
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPendingAction('');
    }
  };

  const runTask = async (task) => {
    setPendingAction(task);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to run workspace task.');
      setTasks(data.tasks);
      if (project?.id && user && !user.isGuest) {
        await logCollabEvent(project.id, user, 'task.started', {
          task,
          label:
            task === 'install' ? 'Install dependencies' :
            task === 'build' ? 'Build app' :
            'Lint app',
        }).catch(() => {});
      }
      notify(
        task === 'install' ? 'Dependency install started' :
        task === 'build' ? 'Build task started' :
        'Lint task started',
        'success'
      );
      setTab('tasks');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPendingAction('');
    }
  };

  const runDeploy = async () => {
    const slug = sanitizeDeploymentSlug(deploySlug);
    if (!slug) {
      notify('Pick a deployment name first.', 'error');
      return;
    }

    setPendingAction('deploy');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          files,
          projectTitle,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to deploy workspace.');
      setDeployments(data.deployments || []);
      setDeploySlug(data.deployment?.slug || slug);
      setSlugTouched(true);
      setTab('deploy');
      if (project?.id && user && !user.isGuest) {
        await logCollabEvent(project.id, user, 'deploy.completed', {
          slug: data.deployment?.slug || slug,
          mode: data.deployment?.mode || workspaceKind.kind,
        }).catch(() => {});
      }
      notify(`Deployment is live at ${window.location.origin}/${data.deployment.slug}`, 'success');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPendingAction('');
    }
  };

  const mergedLogs = [
    ...(runtime?.logs || []),
    ...(tasks.active?.logs || []),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Workspace</span>
            <RuntimeStatusBadge status={runtime?.status || 'stopped'} />
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            {workspaceId}
          </p>
        </div>
      </div>

      {!packageProject && (
        <div className="border-b border-border px-4 py-3 text-xs text-muted">
          Static projects preview directly in the browser. Import a package-based app when you want the workspace runtime to handle React, Next.js, Node.js, and other npm-driven setups.
        </div>
      )}

      <div className="flex border-b border-border">
        {[
          { id: 'runtime', icon: Activity, label: 'Runtime' },
          { id: 'logs', icon: TerminalSquare, label: 'Logs' },
          { id: 'tasks', icon: ListTodo, label: 'Tasks' },
          { id: 'ports', icon: Network, label: 'Ports' },
          { id: 'deploy', icon: Rocket, label: 'Deploy' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex-1 border-b-2 px-2 py-2 text-xs transition-colors ${
              tab === item.id ? 'border-white text-white' : 'border-transparent text-muted hover:text-white'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <item.icon size={12} />
              <span>{item.label}</span>
            </div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          <Loader2 size={16} className="mr-2 animate-spin" />
          Loading workspace state...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {tab === 'runtime' && (
            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Workspace runtime</p>
                    <p className="mt-1 text-xs text-muted">
                      {runtime?.status === 'running'
                        ? `${runtime?.frameworkLabel || workspaceKind.label} runtime is running on port ${runtime.port}.`
                        : runtime?.status === 'starting'
                        ? 'Booting the workspace runtime...'
                        : runtime?.status === 'error'
                        ? runtime.lastError || 'Runtime failed to start.'
                        : packageProject
                        ? 'Start the workspace runtime to run this imported app on the server.'
                        : 'Static projects preview directly without a server runtime.'}
                    </p>
                  </div>
                  <Server size={16} className="text-sky-300" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <TaskButton
                    icon={runtime?.status === 'running' ? RotateCcw : Play}
                    label={runtime?.status === 'running' ? 'Restart runtime' : 'Start runtime'}
                    onClick={() => runRuntimeAction(runtime?.status === 'running' ? 'restart' : 'start')}
                    disabled={pendingAction !== '' || !packageProject}
                  />
                  <TaskButton
                    icon={Square}
                    label="Stop runtime"
                    onClick={() => runRuntimeAction('stop')}
                    disabled={pendingAction !== '' || runtime?.status !== 'running' || !packageProject}
                    subtle
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Started</p>
                  <p className="mt-1 text-sm text-white">{formatTime(runtime?.startedAt)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Last update</p>
                  <p className="mt-1 text-sm text-white">{formatTime(runtime?.updatedAt)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Process ID</p>
                  <p className="mt-1 text-sm text-white">{runtime?.pid || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="h-full">
              {mergedLogs.length === 0 ? (
                <div className="p-4 text-xs text-muted">No logs yet. Start the runtime or run a task to populate this stream.</div>
              ) : (
                mergedLogs.slice(-150).map((entry) => <LogLine key={entry.id} entry={entry} />)
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-white">Workspace tasks</p>
                <p className="mt-1 text-xs text-muted">Run common commands on the server workspace without typing them manually.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <TaskButton
                    icon={Package}
                    label="Install deps"
                    onClick={() => runTask('install')}
                    disabled={pendingAction !== '' || Boolean(tasks.active)}
                  />
                  <TaskButton
                    icon={Hammer}
                    label="Build app"
                    onClick={() => runTask('build')}
                    disabled={pendingAction !== '' || Boolean(tasks.active)}
                    subtle
                  />
                  <TaskButton
                    icon={CheckCircle2}
                    label="Lint app"
                    onClick={() => runTask('lint')}
                    disabled={pendingAction !== '' || Boolean(tasks.active)}
                    subtle
                  />
                </div>
              </div>

              {tasks.active && (
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{tasks.active.label}</p>
                      <p className="mt-1 text-xs text-muted">{tasks.active.command}</p>
                    </div>
                    <Loader2 size={14} className="animate-spin text-sky-300" />
                  </div>
                  <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-white/5 bg-black/30">
                    {tasks.active.logs.length === 0 ? (
                      <div className="p-3 text-xs text-muted">Waiting for task output...</div>
                    ) : (
                      tasks.active.logs.map((entry) => <LogLine key={entry.id} entry={entry} />)
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-white">Recent tasks</p>
                <div className="mt-3 space-y-2">
                  {tasks.history.length === 0 ? (
                    <p className="text-xs text-muted">No completed tasks yet.</p>
                  ) : (
                    tasks.history.map((task) => (
                      <div key={task.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-white">{task.label}</p>
                            <p className="mt-1 text-[11px] text-muted">{task.command}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                            task.status === 'succeeded'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-red-500/15 text-red-300'
                          }`}>
                            {task.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'ports' && (
            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-white">Active ports</p>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-white">Workspace runtime</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {runtime?.status === 'running'
                            ? `Port ${runtime.port} is serving the live ${runtime?.frameworkLabel || workspaceKind.label} app through the proxy route.`
                            : 'No runtime port is currently active.'}
                        </p>
                      </div>
                      <RuntimeStatusBadge status={runtime?.status || 'stopped'} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-3">
                    <p className="text-xs font-medium text-white">Preview route</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-sky-300">
                      {runtime?.previewUrl || `/api/workspaces/${workspaceId}/preview`}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-3">
                    <p className="text-xs font-medium text-white">Workspace type</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {packageProject ? `${workspaceKind.label} package workspace` : 'Static HTML/CSS/JS workspace'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'deploy' && (
            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Ship to a project path</p>
                    <p className="mt-1 text-xs text-muted">
                      Deploy this project to a stable route on your IDE host, like <span className="font-mono text-sky-300">/{suggestedSlug || 'your-project'}</span>.
                    </p>
                  </div>
                  <Rocket size={16} className="text-violet-300" />
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted">Deployment path</span>
                    <div className="mt-2 flex items-center rounded-lg border border-border bg-black/20 px-3 py-2">
                      <span className="shrink-0 text-xs text-muted">{window.location.origin}/</span>
                      <input
                        value={deploySlug}
                        onChange={(event) => {
                          setSlugTouched(true);
                          setDeploySlug(sanitizeDeploymentSlug(event.target.value));
                        }}
                        placeholder={suggestedSlug || 'your-project'}
                        className="ml-1 w-full bg-transparent text-sm text-white outline-none placeholder:text-muted"
                      />
                    </div>
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <TaskButton
                      icon={Rocket}
                      label={pendingAction === 'deploy' ? 'Deploying...' : 'Deploy project'}
                      onClick={runDeploy}
                      disabled={pendingAction !== '' || !canPathDeploy}
                    />
                    <TaskButton
                      icon={RotateCcw}
                      label="Reset slug"
                      onClick={() => {
                        setSlugTouched(false);
                        setDeploySlug(suggestedSlug);
                      }}
                      disabled={pendingAction !== ''}
                      subtle
                    />
                  </div>
                </div>

                {!canPathDeploy && (
                  <p className="mt-3 text-xs text-amber-300">
                    Path deploys currently work for static HTML/CSS/JS and Vite-style React apps. {workspaceKind.label} projects can run in the workspace runtime, but they do not publish to <span className="font-mono">/your-slug</span> yet.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-white">Live deployments</p>
                <div className="mt-3 space-y-2">
                  {deployments.length === 0 ? (
                    <p className="text-xs text-muted">Nothing deployed from this workspace yet.</p>
                  ) : (
                    deployments.map((deployment) => (
                      <div key={deployment.slug} className="rounded-lg border border-white/5 bg-black/20 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-white">{deployment.projectTitle || deployment.slug}</p>
                            <p className="mt-1 break-all font-mono text-[11px] text-sky-300">
                              {window.location.origin}/{deployment.slug}
                            </p>
                            <p className="mt-1 text-[11px] text-muted">
                              {deployment.mode === 'react' ? 'React build' : 'Static build'} · {formatTime(deployment.deployedAt)}
                            </p>
                          </div>
                          <a
                            href={`/${deployment.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-white transition-colors hover:border-border-light"
                          >
                            Open
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
