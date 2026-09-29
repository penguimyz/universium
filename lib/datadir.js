// Where accounts, messages, game requests and announcements are saved.
// Only a Railway volume survives redeploys, so prefer it wherever it's mounted:
//   1. DATA_DIR, if you set it yourself
//   2. RAILWAY_VOLUME_MOUNT_PATH, which Railway sets automatically when a volume is attached
//   3. /data, if it exists
//   4. ./data inside the app (fine locally, but wiped on every Railway deploy)
import { existsSync } from "node:fs";
import { join } from "node:path";

export function dataDir(rootDir) {
  return process.env.DATA_DIR
    || process.env.RAILWAY_VOLUME_MOUNT_PATH
    || (existsSync("/data") ? "/data" : join(rootDir, "data"));
}
export const isPersistent = () => !!(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || existsSync("/data"));
