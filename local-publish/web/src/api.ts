export type JobStatus = 'idle' | 'running' | 'success' | 'failed';
export type TargetStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed';

export interface TargetState {
  status: TargetStatus;
  exitCode: number | null;
  message: string;
}

export interface JobState {
  ok?: boolean;
  status: JobStatus;
  lastExitCode: number | null;
  lastMessage: string;
  startedAt: string | null;
  finishedAt: string | null;
  currentTargets: string[];
  currentTarget?: string | null;
  targets?: Record<string, TargetState>;
  logCount?: number;
}

export interface LogEntry {
  t: number;
  line: string;
  target?: string;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || '\u8bf7\u6c42\u5931\u8d25');
    (err as Error & { status?: number; code?: string }).status = res.status;
    (err as Error & { code?: string }).code = data.code;
    throw err;
  }
  return data as T;
}

export const api = {
  me: () => json<{ ok: boolean; user: { username: string } | null }>('/api/me'),
  login: (username: string, password: string) =>
    json<{ ok: boolean; user: { username: string } }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => json<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  status: () => json<JobState>('/api/status'),
  deploy: (targets: string[]) =>
    json<JobState>('/api/deploy', {
      method: 'POST',
      body: JSON.stringify({ targets }),
    }),
};
