import { RawJsonlRecord, SummaryRecord } from "../domain/conversation";
import { isSummary } from "../domain/jsonl-parser";
import { leafUuidIsValid, resolveLatestLeafUuid } from "../domain/leaf-uuid-resolver";
import { ConversationRepository } from "./conversation-repository";

export class RenameService {
  constructor(private readonly repo: ConversationRepository) {}

  async rename(filePath: string, newTitle: string): Promise<void> {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) {
      throw new Error("Title cannot be empty.");
    }
    const records = await this.repo.readAllRecords(filePath);
    const updated = applyTitle(records, trimmed);
    await this.repo.writeAllRecords(filePath, updated);
  }
}

function applyTitle(records: RawJsonlRecord[], title: string): RawJsonlRecord[] {
  const existingIdx = records.findIndex(isSummary);
  const existing = existingIdx >= 0 ? (records[existingIdx] as SummaryRecord) : undefined;

  let leafUuid = existing?.leafUuid;
  if (!leafUuidIsValid(records, leafUuid)) {
    leafUuid = resolveLatestLeafUuid(records);
  }
  if (!leafUuid) {
    throw new Error("No messages found in conversation; cannot anchor summary.");
  }

  const summary: SummaryRecord = {
    type: "summary",
    summary: title,
    leafUuid,
  };

  if (existingIdx >= 0) {
    const next = records.slice();
    next[existingIdx] = summary;
    return next;
  }
  return [summary, ...records];
}
