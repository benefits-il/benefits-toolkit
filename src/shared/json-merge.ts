import { atomicWriteText, readTextSafe } from "./fs-utils";

export async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  const text = await readTextSafe(file);
  if (text === undefined || text.trim().length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // CRITICAL: a non-empty file that fails to parse must NEVER be treated as
    // an empty object — doing so would let a caller overwrite the user's real
    // config (e.g. ~/.claude/settings.json) with whatever it writes back,
    // destroying permissions/plugins/mcpServers. Surface the error so callers
    // abort instead of clobbering.
    throw new Error(
      `Refusing to parse ${file}: not valid JSON (${(err as Error).message}). The file was left untouched.`,
    );
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  // Parsed, but it's not a JSON object (array / primitive). Also refuse rather
  // than silently replacing it.
  throw new Error(`Refusing to use ${file}: expected a JSON object at the top level.`);
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
