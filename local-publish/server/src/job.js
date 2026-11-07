const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

const SCRIPT_MAP = {
  nginx: 'deploy-nginx-test.ps1',
  'admin-web': 'deploy-admin-web-test.ps1',
  'live-web': 'deploy-live-web-test.ps1',
  all: 'deploy-all-test.ps1',
};

const ORDER = ['nginx', 'admin-web', 'live-web'];

class DeployJobManager extends EventEmitter {
  constructor(scriptsDir) {
    super();
    this.scriptsDir = scriptsDir;
    this.status = 'idle'; // idle | running | success | failed
    this.lastExitCode = null;
    this.lastMessage = '';
    this.startedAt = null;
    this.finishedAt = null;
    this.currentTargets = [];
    this.logs = [];
    this.maxLogs = 5000;
    this.child = null;
  }

  getState() {
    return {
      status: this.status,
      lastExitCode: this.lastExitCode,
      lastMessage: this.lastMessage,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      currentTargets: this.currentTargets,
      logCount: this.logs.length,
    };
  }

  appendLog(line) {
    const entry = { t: Date.now(), line: String(line) };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    this.emit('log', entry);
  }

  resolveScripts(targets) {
    const unique = [...new Set(targets)];
    if (unique.includes('all') || (ORDER.every((k) => unique.includes(k)) && unique.length >= 3)) {
      return [{ key: 'all', file: SCRIPT_MAP.all }];
    }
    return ORDER.filter((k) => unique.includes(k)).map((k) => ({ key: k, file: SCRIPT_MAP[k] }));
  }

  start(targets) {
    if (this.status === 'running') {
      const err = new Error('已有发布任务在执行，请等待结束后再试');
      err.code = 'BUSY';
      throw err;
    }
    const scripts = this.resolveScripts(targets);
    if (!scripts.length) {
      const err = new Error('请至少选择一个发布目标');
      err.code = 'EMPTY';
      throw err;
    }
    for (const s of scripts) {
      const full = path.join(this.scriptsDir, s.file);
      if (!require('fs').existsSync(full)) {
        const err = new Error('脚本不存在: ' + full);
        err.code = 'MISSING';
        throw err;
      }
    }

    this.status = 'running';
    this.lastExitCode = null;
    this.lastMessage = '发布中…';
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.currentTargets = scripts.map((s) => s.key);
    this.logs = [];
    this.emit('status', this.getState());
    this.appendLog('== 开始发布: ' + this.currentTargets.join(', ') + ' ==');

    this._runQueue(scripts, 0);
    return this.getState();
  }

  _runQueue(scripts, index) {
    if (index >= scripts.length) {
      this.status = 'success';
      this.lastExitCode = 0;
      this.lastMessage = '发布成功';
      this.finishedAt = new Date().toISOString();
      this.child = null;
      this.appendLog('== 全部完成 ==');
      this.emit('status', this.getState());
      return;
    }

    const item = scripts[index];
    const scriptPath = path.join(this.scriptsDir, item.file);
    this.appendLog('-- 执行: ' + item.file + ' --');

    const psCommand =
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
      "$OutputEncoding = [System.Text.Encoding]::UTF8; " +
      "& '" + scriptPath.replace(/'/g, "''") + "'";

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
      {
        cwd: this.scriptsDir,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
        },
      }
    );
    this.child = child;

    const onData = (buf) => {
      const text = buf.toString('utf8');
      text.split(/\r?\n/).forEach((line) => {
        if (line.length) this.appendLog(line);
      });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      this.appendLog('[spawn error] ' + err.message);
      this.status = 'failed';
      this.lastExitCode = -1;
      this.lastMessage = err.message;
      this.finishedAt = new Date().toISOString();
      this.child = null;
      this.emit('status', this.getState());
    });

    child.on('close', (code) => {
      const exit = code == null ? -1 : code;
      this.appendLog('-- ' + item.file + ' 退出码: ' + exit + ' --');
      if (exit !== 0) {
        this.status = 'failed';
        this.lastExitCode = exit;
        this.lastMessage = item.file + ' 失败，退出码 ' + exit;
        this.finishedAt = new Date().toISOString();
        this.child = null;
        this.emit('status', this.getState());
        return;
      }
      this._runQueue(scripts, index + 1);
    });
  }
}

module.exports = { DeployJobManager, SCRIPT_MAP, ORDER };
