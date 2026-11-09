const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

const SCRIPT_MAP = {
  nginx: 'deploy-nginx-test.ps1',
  'admin-web': 'deploy-admin-web-test.ps1',
  'live-web': 'deploy-live-web-test.ps1',
};

const ORDER = ['nginx', 'admin-web', 'live-web'];

function emptyTargetState() {
  return { status: 'idle', exitCode: null, message: '' };
}

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
    this.currentTarget = null;
    this.targets = {}; // { [name]: { status, exitCode, message } }
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
      currentTarget: this.currentTarget,
      targets: this.targets,
      logCount: this.logs.length,
    };
  }

  setTargetState(key, patch) {
    const prev = this.targets[key] || emptyTargetState();
    this.targets[key] = { ...prev, ...patch };
  }

  appendLog(line, target) {
    const t = target != null ? target : this.currentTarget || 'system';
    const entry = { t: Date.now(), line: String(line), target: t };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    this.emit('log', entry);
  }

  resolveScripts(targets) {
    const unique = [...new Set(targets)];
    // Expand "all" (or all three checked) into individual scripts so each gets its own log target/tab.
    if (unique.includes('all') || (ORDER.every((k) => unique.includes(k)) && unique.length >= 3)) {
      return ORDER.map((k) => ({ key: k, file: SCRIPT_MAP[k] }));
    }
    return ORDER.filter((k) => unique.includes(k)).map((k) => ({ key: k, file: SCRIPT_MAP[k] }));
  }

  start(targets) {
    if (this.status === 'running') {
      const err = new Error('\u5df2\u6709\u53d1\u5e03\u4efb\u52a1\u5728\u6267\u884c\uff0c\u8bf7\u7b49\u5f85\u7ed3\u675f\u540e\u518d\u8bd5');
      err.code = 'BUSY';
      throw err;
    }
    const scripts = this.resolveScripts(targets);
    if (!scripts.length) {
      const err = new Error('\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u53d1\u5e03\u76ee\u6807');
      err.code = 'EMPTY';
      throw err;
    }
    for (const s of scripts) {
      const full = path.join(this.scriptsDir, s.file);
      if (!require('fs').existsSync(full)) {
        const err = new Error('\u811a\u672c\u4e0d\u5b58\u5728: ' + full);
        err.code = 'MISSING';
        throw err;
      }
    }

    this.status = 'running';
    this.lastExitCode = null;
    this.lastMessage = '\u53d1\u5e03\u4e2d\u2026';
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.currentTargets = scripts.map((s) => s.key);
    this.currentTarget = null;
    this.targets = {};
    for (const s of scripts) {
      this.targets[s.key] = {
        status: 'pending',
        exitCode: null,
        message: '\u7b49\u5f85\u4e2d',
      };
    }
    this.logs = [];
    this.emit('status', this.getState());
    this.appendLog('== \u5f00\u59cb\u53d1\u5e03: ' + this.currentTargets.join(', ') + ' ==', 'system');

    this._runQueue(scripts, 0);
    return this.getState();
  }

  _runQueue(scripts, index) {
    if (index >= scripts.length) {
      this.currentTarget = null;
      this.status = 'success';
      this.lastExitCode = 0;
      this.lastMessage = '\u53d1\u5e03\u6210\u529f';
      this.finishedAt = new Date().toISOString();
      this.child = null;
      this.appendLog('== \u5168\u90e8\u5b8c\u6210 ==', 'system');
      this.emit('status', this.getState());
      return;
    }

    const item = scripts[index];
    const scriptPath = path.join(this.scriptsDir, item.file);
    this.currentTarget = item.key;
    this.setTargetState(item.key, {
      status: 'running',
      exitCode: null,
      message: '\u53d1\u5e03\u4e2d\u2026',
    });
    this.emit('status', this.getState());
    this.appendLog('-- \u6267\u884c: ' + item.file + ' --', item.key);

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
        if (line.length) this.appendLog(line, item.key);
      });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      this.appendLog('[spawn error] ' + err.message, item.key);
      this.setTargetState(item.key, {
        status: 'failed',
        exitCode: -1,
        message: err.message,
      });
      // mark remaining as cancelled/idle
      for (let i = index + 1; i < scripts.length; i++) {
        this.setTargetState(scripts[i].key, {
          status: 'idle',
          exitCode: null,
          message: '\u5df2\u53d6\u6d88',
        });
      }
      this.status = 'failed';
      this.lastExitCode = -1;
      this.lastMessage = err.message;
      this.finishedAt = new Date().toISOString();
      this.child = null;
      this.emit('status', this.getState());
    });

    child.on('close', (code) => {
      const exit = code == null ? -1 : code;
      this.appendLog('-- ' + item.file + ' \u9000\u51fa\u7801: ' + exit + ' --', item.key);
      if (exit !== 0) {
        this.setTargetState(item.key, {
          status: 'failed',
          exitCode: exit,
          message: item.file + ' \u5931\u8d25\uff0c\u9000\u51fa\u7801 ' + exit,
        });
        for (let i = index + 1; i < scripts.length; i++) {
          this.setTargetState(scripts[i].key, {
            status: 'idle',
            exitCode: null,
            message: '\u5df2\u53d6\u6d88',
          });
        }
        this.status = 'failed';
        this.lastExitCode = exit;
        this.lastMessage = item.file + ' \u5931\u8d25\uff0c\u9000\u51fa\u7801 ' + exit;
        this.finishedAt = new Date().toISOString();
        this.child = null;
        this.emit('status', this.getState());
        return;
      }
      this.setTargetState(item.key, {
        status: 'success',
        exitCode: 0,
        message: '\u53d1\u5e03\u6210\u529f',
      });
      this.emit('status', this.getState());
      this._runQueue(scripts, index + 1);
    });
  }
}

module.exports = { DeployJobManager, SCRIPT_MAP, ORDER };
