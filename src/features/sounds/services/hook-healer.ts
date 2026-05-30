import * as vscode from "vscode";
import { claudeRoot } from "../../../core/paths";
import { logger } from "../../../core/logger";
import { SoundVariant } from "../../../core/config-manager";
import { HookInstaller } from "./hook-installer";

const DEBOUNCE_MS = 800;

export type VariantProvider = () => { stop: SoundVariant; notification: SoundVariant };

/**
 * Keeps the managed sound hooks alive in ~/.claude/settings.json.
 *
 * Those hooks live in a file that Claude Code ALSO owns and rewrites: every time
 * a new permission is approved, Claude Code writes the whole settings.json from
 * its in-memory snapshot, which silently drops the hooks this extension added
 * out-of-band. A one-time heal on activation is therefore not enough — on a
 * machine whose permission allowlist grows often, the hooks get clobbered
 * mid-session and stay gone until the window reloads. (On a machine with a
 * stable allowlist, settings.json is never rewritten, so the hooks survive
 * forever — which is exactly why "it never breaks on my other computer".)
 *
 * This watcher re-applies the hooks idempotently, debounced, within ~1s of any
 * external change to settings.json, so sounds keep working no matter who
 * rewrites the file. ensureInstalled() only writes when something is actually
 * missing or stale, so re-applying after our own write is a cheap read-only
 * no-op and never loops.
 */
export class HookHealer implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private rerun = false;
  private active = true;
  private disposed = false;

  constructor(
    private readonly installer: HookInstaller,
    private readonly variants: VariantProvider,
  ) {}

  /** Heal once now, then watch settings.json and heal on every change. */
  async start(): Promise<void> {
    await this.heal("startup");
    try {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(claudeRoot()), "settings.json");
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.watcher.onDidChange(() => this.schedule());
      this.watcher.onDidCreate(() => this.schedule());
    } catch (err) {
      logger.warn("sounds", "Could not watch settings.json for hook healing", err);
    }
  }

  /** User explicitly removed the hooks — stop putting them back this session. */
  pause(): void {
    this.active = false;
  }

  /** User (re)installed — resume keeping the hooks alive. */
  resume(): void {
    this.active = true;
  }

  private schedule(): void {
    if (this.disposed || !this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.heal("watch"), DEBOUNCE_MS);
  }

  private async heal(source: string): Promise<void> {
    if (this.disposed || !this.active) return;
    // Serialize: never let two heals (e.g. startup + a watch event) overlap on
    // the same file. Coalesce a request that arrives mid-run into one re-run.
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      const v = this.variants();
      const changed = await this.installer.ensureInstalled(v.stop, v.notification);
      if (changed) {
        logger.info("sounds", `Sound hooks re-applied after settings.json change (${source}).`);
      }
    } catch (err) {
      // settings.json may be momentarily missing / half-written / invalid JSON
      // (Claude Code mid-write). readJsonObject refuses to clobber and throws;
      // we just wait for the next change event and retry.
      logger.warn("sounds", `Hook heal skipped (${source})`, err);
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.schedule();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.watcher?.dispose();
  }
}
