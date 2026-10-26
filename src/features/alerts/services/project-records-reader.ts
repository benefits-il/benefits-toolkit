import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProjectRecord } from "./project-registry";

/**
 * Every project record the editor windows keep in ~/.benefits-toolkit/projects
 * (see ProjectRegistryWriter). A half-written or foreign file is skipped.
 */
export async function readProjectRecords(dir: string): Promise<ProjectRecord[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const records: ProjectRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const record = JSON.parse(await fs.readFile(path.join(dir, name), "utf8")) as ProjectRecord;
      if (record && typeof record.folder === "string") records.push(record);
    } catch {
      // skip
    }
  }
  return records;
}
