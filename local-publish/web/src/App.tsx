import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, JobState, JobStatus } from './api';

type Target = 'nginx' | 'admin-web' | 'live-web';

const TARGET_OPTIONS: { key: Target; label: string }[] = [
  { key: 'nginx', label: 'nginx 配置' },
  { key: 'admin-web', label: 'admin-web 管理端' },
  { key: 'live-web', label: 'live-web 观众端' },
];

function statusLabel(s: JobStatus) {
  switch (s) {
    case 'idle':
      return '空闲';
    case 'running':
      return '发布中';
    case 'success':
      return '成功';
    case 'failed':
      return '失败';
  }
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
  });
  const [logs, setLogs] = useState<string[]>([]);
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
          const data = JSON.parse((ev as MessageEvent).data) as { line: string };
          setLogs((prev) => [...prev, data.line]);
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

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

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
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '登录失败');
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
    try {
      const state = await api.deploy(targets);
      setJob(state);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '触发失败');
    }
  }

  function toggle(key: Target) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="card">加载中…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <div className="card">
          <h1>本地发布控制台</h1>
          <p className="sub">登录后可一键触发 test 环境前端发布脚本</p>
          <form className="login-form" onSubmit={onLogin}>
            <label>
              账号
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn" type="submit">
              登录
            </button>
            {loginError ? <div className="error">{loginError}</div> : null}
          </form>
        </div>
      </div>
    );
  }

  const running = job.status === 'running';

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>本地发布控制台</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            已登录：{user} · 调用 scripts/test 下现有 PowerShell 脚本
          </p>
        </div>
        <button className="btn ghost" type="button" onClick={onLogout}>
          退出
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className={'status-pill ' + job.status}>{statusLabel(job.status)}</span>
          <span className="meta" style={{ margin: 0 }}>
            {job.lastMessage || '等待操作'}
            {job.lastExitCode != null ? ' · exit ' + job.lastExitCode : ''}
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
            发布所选
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={running}
            onClick={() => runDeploy(['all'])}
          >
            全部发布
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setLogs([])}
            disabled={running && logs.length === 0}
          >
            清空日志显示
          </button>
        </div>

        {actionError ? <div className="error">{actionError}</div> : null}

        <div className="meta">
          目标：{(job.currentTargets.length ? job.currentTargets : selectedKeys).join(', ') || '—'}
          {job.startedAt ? ' · 开始 ' + job.startedAt : ''}
          {job.finishedAt ? ' · 结束 ' + job.finishedAt : ''}
        </div>

        <div className="log-box" ref={logRef}>
          {logs.length ? logs.join('\n') : '（暂无日志，点击发布后在此实时输出）'}
        </div>
      </div>
    </div>
  );
}
