import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ConversationMeta } from "../domain/conversation";
import { ensureDir, pathExists } from "../../../shared/fs-utils";
import { ConversationRepository } from "./conversation-repository";

export class ArchiveService {
  constructor(private readonly repo: ConversationRepository) {}

  async archive(meta: ConversationMeta): Promise<string> {
    if (meta.archived) return meta.filePath;
    const dest = this.repo.archiveDestFor(meta);
    await ensureDir(path.dirname(dest));
    await safeMove(meta.filePath, dest);
    return dest;
  }

  async restore(meta: ConversationMeta): Promise<string> {
    if (!meta.archived) return meta.filePath;
    const dest = this.repo.restoreDestFor(meta);
    await ensureDir(path.dirname(dest));
    await safeMove(meta.filePath, dest);
    return dest;
  }

  async delete(meta: ConversationMeta): Promise<void> {
    if (await pathExists(meta.filePath)) {
      await fs.unlink(meta.filePath);
    }
  }
}

async function safeMove(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
  }
  await fs.copyFile(src, dest);
  await fs.unlink(src);
}
