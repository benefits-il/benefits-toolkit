import { PRESET_PALETTE, PresetGroup } from "../window-color/services/color-utils";

/**
 * The order new projects take colors in: the vivid mid row first, so the
 * first projects differ the most, then the Benefits colors, deep and soft.
 */
const GROUP_ORDER: readonly PresetGroup[] = ["mid", "benefits", "deep", "soft"];

export const COLOR_ORDER: readonly string[] = GROUP_ORDER.flatMap((g) => PRESET_PALETTE.filter((p) => p.group === g).map((p) => p.hex));

/** The first preset no other project uses; undefined once all of them are taken. */
export function pickFreeColor(used: Iterable<string | null | undefined>): string | undefined {
  const taken = new Set([...used].filter((c): c is string => !!c).map((c) => c.toLowerCase()));
  return COLOR_ORDER.find((hex) => !taken.has(hex.toLowerCase()));
}

/**
 * The first sound of the pool no other project uses (nor the defaults, which
 * the `used` list includes). Once every sound is taken, the least used one, so
 * repeats spread out.
 */
export function pickFreeSound(pool: readonly string[], used: Iterable<string | null | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const id of used) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const free = pool.find((id) => !counts.has(id));
  if (free) return free;
  let best: string | undefined;
  for (const id of pool) if (best === undefined || (counts.get(id) ?? 0) < (counts.get(best) ?? 0)) best = id;
  return best;
}
