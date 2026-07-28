import * as path from "node:path";
import { appendJsonlLine } from "../../../shared/fs-utils";

/**
 * Renames a conversation the way Claude Code itself does: by appending a
 * `custom-title` record keyed to the session id (the .jsonl filename).
 *
 * The old approach wrote a `{type:"summary"}` record via a full-file rewrite.
 * Claude Code no longer reads `summary` records for the session title (so the
 * rename was invisible in its own UI) and the rewrite could clobber lines the
 * CLI appended to a live session mid-write. Appending is safe against a live
 * writer, and because Claude Code reads `custom-title` too, the rename now
 * shows up in both UIs.
 */
export class RenameService {
  async rename(filePath: string, newTitle: string): Promise<void> {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) {
      throw new Error("Title cannot be empty.");
    }
    await appendJsonlLine(filePath, {
      type: "custom-title",
      customTitle: trimmed,
      sessionId: path.basename(filePath, ".jsonl"),
    });
  }
}
