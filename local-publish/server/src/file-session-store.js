const fs = require('fs');
const path = require('path');
const session = require('express-session');

class FileSessionStore extends session.Store {
  constructor(options) {
    super(options);
    this.dir = options.dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  _file(sid) {
    return path.join(this.dir, encodeURIComponent(sid) + '.json');
  }

  get(sid, cb) {
    fs.readFile(this._file(sid), 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') return cb(null, null);
        return cb(err);
      }
      try {
        cb(null, JSON.parse(data));
      } catch (e) {
        cb(e);
      }
    });
  }

  set(sid, sess, cb) {
    fs.writeFile(this._file(sid), JSON.stringify(sess), 'utf8', (err) => cb(err || null));
  }

  destroy(sid, cb) {
    fs.unlink(this._file(sid), (err) => {
      if (err && err.code !== 'ENOENT') return cb(err);
      cb(null);
    });
  }
}

module.exports = FileSessionStore;
