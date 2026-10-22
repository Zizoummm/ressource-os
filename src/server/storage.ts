import { dataDirectory } from "./runtime";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
export interface EvidenceStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
const directory = join(dataDirectory(), "documents");
const safe = (key: string) => {
  if (!/^[a-f0-9-]+$/.test(key)) throw new Error("Invalid storage key");
  return join(directory, key);
};
export const storage: EvidenceStorage = {
  async put(key, data) {
    await mkdir(directory, { recursive: true });
    await writeFile(safe(key), data, { flag: "wx", mode: 0o600 });
  },
  get(key) {
    return readFile(safe(key));
  },
  async remove(key) {
    await unlink(safe(key));
  },
};
