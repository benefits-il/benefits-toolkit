import { RawJsonlRecord } from "./conversation";
import { isMessage } from "./jsonl-parser";

export function resolveLatestLeafUuid(records: RawJsonlRecord[]): string | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (isMessage(r)) {
      return r.uuid;
    }
  }
  return undefined;
}

export function findRecordIndexByUuid(records: RawJsonlRecord[], uuid: string): number {
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (isMessage(r) && r.uuid === uuid) return i;
  }
  return -1;
}

export function leafUuidIsValid(records: RawJsonlRecord[], leafUuid: string | undefined): boolean {
  if (!leafUuid) return false;
  return findRecordIndexByUuid(records, leafUuid) >= 0;
}
