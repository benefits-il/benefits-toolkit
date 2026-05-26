import { atomicWriteText, readTextSafe } from "./fs-utils";

export async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  const text = await readTextSafe(file);
  if (text === undefined || text.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export async function writeJsonObject(file: string, data: Record<string, unknown>): Promise<void> {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  await atomicWriteText(file, text);
}

export async function mutateJsonObject(
  file: string,
  mutate: (data: Record<string, unknown>) => void,
): Promise<void> {
  const data = await readJsonObject(file);
  mutate(data);
  await writeJsonObject(file, data);
}
