import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event, user }) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tmpFile = `/tmp/awg-easy-backup-${stamp}.db`;
    try {
      await Database.backup(tmpFile);
      logAudit(event, user, 'admin.backup_exported');
      setHeader(
        event,
        'Content-Disposition',
        `attachment; filename="awg-easy-backup-${stamp}.db"`
      );
      setHeader(event, 'Content-Type', 'application/octet-stream');
      await sendStream(event, createReadStream(tmpFile));
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }
);
