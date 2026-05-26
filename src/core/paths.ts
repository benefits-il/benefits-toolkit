import * as os from "node:os";
import * as path from "node:path";

export function homeDir(): string {
  return os.homedir();
}

export function claudeRoot(): string {
  return path.join(homeDir(), ".claude");
}

export function claudeSettingsFile(): string {
  return path.join(claudeRoot(), "settings.json");
}

export function claudeProjectsDir(): string {
  return path.join(claudeRoot(), "projects");
}

export function claudeArchiveDir(): string {
  return path.join(claudeProjectsDir(), "_archive");
}

export function claudeSoundsDir(): string {
  return path.join(claudeRoot(), "sounds", "benefit");
}

export function vscodeExtensionsDir(): string {
  return path.join(homeDir(), ".vscode", "extensions");
}
