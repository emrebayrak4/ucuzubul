/**
 * Object storage abstraction (S3-compatible interface). Dev uses the local-disk driver, whose files the API
 * serves under /static. A production S3/R2 driver implements the same interface (TODO; set STORAGE_DRIVER=s3).
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ObjectStorage {
  /** Stores bytes under `key` (e.g. "logos/retailers/amazon-1a2b3c.png") and returns the public URL. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  /** Deletes the object behind a public URL previously returned by put(); ignores foreign URLs. */
  deleteByUrl(url: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

export class LocalDiskStorage implements ObjectStorage {
  constructor(
    /** Directory that the API serves at `${publicBase}`. */
    readonly rootDir: string,
    /** e.g. http://localhost:4400/static */
    readonly publicBase: string,
  ) {}

  private resolve(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
    return path.join(this.rootDir, ...key.split("/"));
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<string> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `${this.publicBase.replace(/\/+$/, "")}/${key}`;
  }

  async deleteByUrl(url: string): Promise<void> {
    const base = this.publicBase.replace(/\/+$/, "") + "/";
    if (!url.startsWith(base)) return;
    await rm(this.resolve(url.slice(base.length)), { force: true });
  }
}

/** Default dev storage location: <repo>/.data/storage (gitignored via .data). */
export function defaultStorageDir(cwd = process.cwd()): string {
  const repoRoot = path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(repoRoot, ".data", "storage");
}
