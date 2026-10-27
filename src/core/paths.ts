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

/** Where sounds lived before v0.7 (one fixed file per slot + play.ps1). */
export function claudeSoundsDir(): string {
  return path.join(claudeRoot(), "sounds", "benefit");
}

/**
 * The toolkit's own home, shared by every editor that runs it and by the agent
 * hooks (which can't ask the extension anything): the alert dispatcher
 * scripts, the sound pool, config.json and one record per open project.
 * BENEFITS_TOOLKIT_HOME overrides it for tests.
 */
export function toolkitHome(): string {
  return process.env.BENEFITS_TOOLKIT_HOME || path.join(homeDir(), ".benefits-toolkit");
}

export function toolkitBinDir(): string {
  return path.join(toolkitHome(), "bin");
}

export function toolkitSoundsDir(): string {
  return path.join(toolkitHome(), "sounds");
}

export function toolkitProjectsDir(): string {
  return path.join(toolkitHome(), "projects");
}

export function toolkitConfigFile(): string {
  return path.join(toolkitHome(), "config.json");
}

/** Cursor's per-user folder: its hooks.json and its agent's transcripts. */
export function cursorRoot(): string {
  return path.join(homeDir(), ".cursor");
}

export function cursorHooksFile(): string {
  return path.join(cursorRoot(), "hooks.json");
}

export function cursorProjectsDir(): string {
  return path.join(cursorRoot(), "projects");
}

/** Antigravity's per-user folder (its agent's conversations live under brain/). */
export function antigravityRoot(): string {
  return path.join(homeDir(), ".gemini", "antigravity");
}

export function antigravityBrainDir(): string {
  return path.join(antigravityRoot(), "brain");
}

/** Antigravity's hooks file; ~/.gemini/config belongs to Antigravity, not to the Gemini CLI. */
export function antigravityHooksFile(): string {
  return path.join(homeDir(), ".gemini", "config", "hooks.json");
}

export function vscodeExtensionsDir(): string {
  return path.join(homeDir(), ".vscode", "extensions");
}
