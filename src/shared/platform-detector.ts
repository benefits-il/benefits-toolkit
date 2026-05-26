export type SupportedPlatform = "win32" | "darwin" | "linux";

export function currentPlatform(): SupportedPlatform | "unsupported" {
  const p = process.platform;
  if (p === "win32" || p === "darwin" || p === "linux") {
    return p;
  }
  return "unsupported";
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function isMac(): boolean {
  return process.platform === "darwin";
}

export function isLinux(): boolean {
  return process.platform === "linux";
}
