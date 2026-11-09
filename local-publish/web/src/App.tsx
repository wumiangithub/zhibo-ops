import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, JobState, JobStatus, LogEntry, TargetStatus } from './api';

type Target = 'nginx' | 'admin-web' | 'live-web';
type TabKey = 'all' | Target | string;

const TARGET_OPTIONS: { key: Target; label: string }[] = [
  { key: 'nginx', label: 'nginx \u914d\u7f6e' },
  { key: 'admin-web', label: 'admin-web \u7ba1\u7406\u7aef' },
  { key: 'live-web', label: 'live-web \u89c2\u4f17\u7aef' },
];

const TARGET_LABEL: Record<string, string> = {
  all: '\u5168\u90e8',
  nginx: 'nginx',
  'admin-web': 'admin-web',
  'live-web': 'live-web',
};

function statusLabel(s: JobStatus | TargetStatus | string) {
  switch (s) {
    case 'idle':
      return '\u7a7a\u95f2';
    case 'pending':
      return '\u7b49\u5f85';
    case 'running':
      return '\u53d1\u5e03\u4e2d';
    case 'success':
      return '\u6210\u529f';
    case 'failed':
      return '\u5931\u8d25';
    default:
      return String(s || '\u7a7a\u95f2');
  }
}

function shortStatus(s: TargetStatus | string | undefined) {
  switch (s) {
    case 'pending':
      return '\u7b49';
    case 'running':
      return '\u8dd1';
    case 'success':
      return '\u6210';
    case 'failed':
      return '\u8d25';
    default:
      return '';
  }
}

function labelOf(key: string) {
  return TARGET_LABEL[key] || key;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [username, setUsername] = useState('ops');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [selected, setSelected] = useState<Record<Target, boolean>>({
    nginx: false,
    'admin-web': false,
    'live-web': false,
  });
  const [job, setJob] = useState<JobState>({
    status: 'idle',
    lastExitCode: null,
    lastMessage: '',
    startedAt: null,
    finishedAt: null,
    currentTargets: [],
    currentTarget: null,
    targets: {},
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [userPickedTab, setUserPickedTab] = useState(false);
  const [actionError, setActionError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user?.username ?? null);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource('/api/logs/stream', { withCredentials: true });
      es.addEventListener('log', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as LogEntry;
          setLogs((prev) => [...prev, { t: data.t, line: data.line, target: data.target || 'system' }]);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('status', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as JobState;
          setJob(data);
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        es?.close();
        setTimeout(connect, 2000);
      };
    };

    api.status().then(setJob).catch(() => undefined);
    connect();

    return () => {
      closed = true;
      es?.close();
    };
  }, [user]);

  // Auto-follow current running target unless user manually picked a tab.
  useEffect(() => {
    if (userPickedTab) return;
    if (job.status === 'running' && job.currentTarget && job.currentTarget !== 'system') {
      setActiveTab(job.currentTarget);
    }
  }, [job.currentTarget, job.status, userPickedTab]);

  const tabKeys = useMemo(() => {
    const keys: TabKey[] = ['all'];
    const seen = new Set<string>();
    for (const t of job.currentTargets || []) {
      if (t === 'system') continue;
      if (!seen.has(t)) {
        seen.add(t);
        keys.push(t);
      }
    }
    if ((job.currentTargets || []).length === 0) {
      const fromLogs = [...new Set(logs.map((l) => l.target || 'system'))].filter(
        (k) => k !== 'all' && k !== 'system'
      );
      for (const k of fromLogs) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    return keys;
  }, [job.currentTargets, logs]);

  const visibleLines = useMemo(() => {
    if (activeTab === 'all') return logs.map((l) => l.line);
    return logs.filter((l) => (l.target || 'system') === activeTab).map((l) => l.line);
  }, [logs, activeTab]);

  const displayStatus = useMemo(() => {
    if (activeTab !== 'all' && job.targets && job.targets[activeTab]) {
      const t = job.targets[activeTab];
      return {
        status: t.status as string,
        message: t.message || '',
        exitCode: t.exitCode,
      };
    }
    // overall / all tab
    if (job.status === 'running' && job.currentTargets?.length) {
      const parts = job.currentTargets.map((k) => {
        const t = job.targets?.[k];
        return k + ':' + statusLabel(t?.status || 'pending');
      });
      return {
        status: job.status,
        message: parts.join(' \u00b7 ') || job.lastMessage || '',
        exitCode: job.lastExitCode,
      };
    }
    return {
      status: job.status,
      message: job.lastMessage || '\u7b49\u5f85\u64cd\u4f5c',
      exitCode: job.lastExitCode,
    };
  }, [activeTab, job]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleLines, activeTab]);

  const selectedKeys = useMemo(
    () => TARGET_OPTIONS.filter((t) => selected[t.key]).map((t) => t.key),
    [selected]
  );

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const r = await api.login(username, password);
      setUser(r.user.username);
      setPassword('');
      setLogs([]);
      setActiveTab('all');
      setUserPickedTab(false);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '\u767b\u5f55\u5931\u8d25');
    }
  }

  async function onLogout() {
    await api.logout().catch(() => undefined);
    setUser(null);
    setLogs([]);
  }

  async function runDeploy(targets: string[]) {
    setActionError('');
    setLogs([]);
    setActiveTab('all');
    setUserPickedTab(false);
    try {
      const state = await api.deploy(targets);
      setJob(state);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '\u89e6\u53d1\u5931\u8d25');
    }
  }

  function toggle(key: Target) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function pickTab(key: TabKey) {
    setActiveTab(key);
    setUserPickedTab(true);
  }

  function clearLogs() {
    setLogs([]);
    setActiveTab('all');
    setUserPickedTab(false);
  }

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="card">{'\u52a0\u8f7d\u4e2d\u2026'}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <div className="card">
          <h1>{'\u672c\u5730\u53d1\u5e03\u63a7\u5236\u53f0'}</h1>
          <p className="sub">{'\u767b\u5f55\u540e\u53ef\u4e00\u952e\u89e6\u53d1 test \u73af\u5883\u524d\u7aef\u53d1\u5e03\u811a\u672c'}</p>
          <form className="login-form" onSubmit={onLogin}>
            <label>
              {'\u8d26\u53f7'}
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </label>
            <label>
              {'\u5bc6\u7801'}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn" type="submit">
              {'\u767b\u5f55'}
            </button>
            {loginError ? <div className="error">{loginError}</div> : null}
          </form>
        </div>
      </div>
    );
  }

  const running = job.status === 'running';
  const showTabs = tabKeys.length > 1;
  const pillStatus = displayStatus.status === 'pending' ? 'running' : displayStatus.status;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>{'\u672c\u5730\u53d1\u5e03\u63a7\u5236\u53f0'}</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            {'\u5df2\u767b\u5f55\uff1a'}
            {user}
            {' \u00b7 \u8c03\u7528 scripts/test \u4e0b\u73b0\u6709 PowerShell \u811a\u672c'}
          </p>
        </div>
        <button className="btn ghost" type="button" onClick={onLogout}>
          {'\u9000\u51fa'}
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className={'status-pill ' + pillStatus}>{statusLabel(displayStatus.status)}</span>
          <span className="meta" style={{ margin: 0 }}>
            {displayStatus.message || '\u7b49\u5f85\u64cd\u4f5c'}
            {displayStatus.exitCode != null ? ' \u00b7 exit ' + displayStatus.exitCode : ''}
          </span>
        </div>

        <div className="targets">
          {TARGET_OPTIONS.map((t) => (
            <label key={t.key}>
              <input
                type="checkbox"
                checked={selected[t.key]}
                disabled={running}
                onChange={() => toggle(t.key)}
              />
              {t.label}
            </label>
          ))}
        </div>

        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={running || selectedKeys.length === 0}
            onClick={() => runDeploy(selectedKeys)}
          >
            {'\u53d1\u5e03\u6240\u9009'}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={running}
            onClick={() => runDeploy(['all'])}
          >
            {'\u5168\u90e8\u53d1\u5e03'}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={clearLogs}
            disabled={running && logs.length === 0}
          >
            {'\u6e05\u7a7a\u65e5\u5fd7\u663e\u793a'}
          </button>
        </div>

        {actionError ? <div className="error">{actionError}</div> : null}

        <div className="meta">
          {'\u76ee\u6807\uff1a'}
          {(job.currentTargets.length ? job.currentTargets : selectedKeys).join(', ') || '\u2014'}
          {job.currentTarget ? ' \u00b7 \u5f53\u524d ' + job.currentTarget : ''}
          {job.startedAt ? ' \u00b7 \u5f00\u59cb ' + job.startedAt : ''}
          {job.finishedAt ? ' \u00b7 \u7ed3\u675f ' + job.finishedAt : ''}
        </div>

        {showTabs ? (
          <div className="log-tabs" role="tablist">
            {tabKeys.map((key) => {
              const isActive = activeTab === key;
              const tState = key !== 'all' ? job.targets?.[key] : undefined;
              const tStatus = tState?.status;
              const isRunning = tStatus === 'running' || (running && job.currentTarget === key);
              const badge = key === 'all' ? '' : shortStatus(tStatus);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={
                    'log-tab' +
                    (isActive ? ' active' : '') +
                    (isRunning ? ' running' : '') +
                    (tStatus ? ' st-' + tStatus : '')
                  }
                  onClick={() => pickTab(key)}
                >
                  {labelOf(key)}
                  {badge ? <span className={'tab-badge st-' + tStatus}>{badge}</span> : null}
                  {isRunning ? <span className="tab-dot" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="log-box" ref={logRef}>
          {visibleLines.length
            ? visibleLines.join('\n')
            : '\uff08\u6682\u65e0\u65e5\u5fd7\uff0c\u70b9\u51fb\u53d1\u5e03\u540e\u5728\u6b64\u5b9e\u65f6\u8f93\u51fa\uff09'}
        </div>
      </div>
    </div>
  );
}
