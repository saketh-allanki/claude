// When started as root inside a container (e.g. because the host mounts the data volume
// owned by root), take ownership of the data directory and continue as an unprivileged user.
import fs from 'node:fs';
import path from 'node:path';

function lookupUser(name) {
  const line = fs
    .readFileSync('/etc/passwd', 'utf8')
    .split('\n')
    .find((l) => l.split(':')[0] === name);
  if (!line) throw new Error(`User ${name} not found`);
  const [, , uid, gid] = line.split(':');
  return { uid: Number(uid), gid: Number(gid) };
}

function chownRecursive(target, uid, gid) {
  fs.chownSync(target, uid, gid);
  if (fs.statSync(target).isDirectory()) {
    for (const entry of fs.readdirSync(target)) chownRecursive(path.join(target, entry), uid, gid);
  }
}

export function dropPrivileges(userName, dirs) {
  if (!userName || typeof process.getuid !== 'function' || process.getuid() !== 0) return false;
  const { uid, gid } = lookupUser(userName);
  for (const dir of dirs.filter(Boolean)) {
    fs.mkdirSync(dir, { recursive: true });
    chownRecursive(dir, uid, gid);
  }
  process.setgid(gid);
  process.setuid(uid);
  return true;
}
