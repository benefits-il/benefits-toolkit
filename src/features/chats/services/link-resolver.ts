import * as path from "node:path";

export interface ParsedFileLink {
  path: string;
  startLine?: number;
  endLine?: number;
}

export function isWebLink(raw: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(raw);
}

/** Decode a markdown-it-normalized (percent-encoded) href; hostile input stays as-is. */
export function safeDecode(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/**
 * Split a link destination into a path and an optional #L42 / #L42-L51 line
 * fragment. A non-line fragment (e.g. "#section") is stripped: on a non-web
 * link it is almost certainly not part of the filename.
 */
export function parseFileLink(raw: string): ParsedFileLink {
  const hashIndex = raw.indexOf("#");
  if (hashIndex < 0) return { path: raw };
  const filePath = raw.slice(0, hashIndex);
  const fragment = raw.slice(hashIndex + 1);
  const match = /^L(\d+)(?:-L?(\d+))?$/i.exec(fragment);
  if (!match) return { path: filePath };
  let startLine = parseInt(match[1], 10);
  let endLine = match[2] !== undefined ? parseInt(match[2], 10) : undefined;
  if (endLine !== undefined && endLine < startLine) {
    [startLine, endLine] = [endLine, startLine];
  }
  return { path: filePath, startLine, endLine };
}

/**
 * Absolute-path candidates to try in order for a link destination.
 * - Windows-absolute / UNC → the path itself only.
 * - Leading-slash posix ("/src/foo") → as-is, then joined onto cwd and roots
 *   (on win32 it is drive-relative, so the joins are the realistic matches).
 * - Plain relative → resolved against cwd first (the conversation's recorded
 *   working directory), then each workspace root.
 */
export function resolveCandidates(
  p: string,
  cwd: string | undefined,
  workspaceRoots: string[],
): string[] {
  const cleaned = p.trim().replace(/^\.\//, "");
  if (cleaned === "") return [];

  let candidates: string[];
  if (/^[a-zA-Z]:[\\/]/.test(cleaned) || /^\\\\/.test(cleaned)) {
    candidates = [path.normalize(cleaned)];
  } else if (/^[\\/]/.test(cleaned)) {
    candidates = [
      path.normalize(cleaned),
      ...(cwd ? [path.join(cwd, cleaned)] : []),
      ...workspaceRoots.map((root) => path.join(root, cleaned)),
    ];
  } else {
    candidates = [
      ...(cwd ? [path.resolve(cwd, cleaned)] : []),
      ...workspaceRoots.map((root) => path.resolve(root, cleaned)),
    ];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
