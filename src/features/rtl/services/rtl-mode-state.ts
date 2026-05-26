import { RtlMode, readConfig, updateConfig } from "../../../core/config-manager";

export function currentMode(): RtlMode {
  return readConfig().rtl.mode;
}

export async function setMode(mode: RtlMode): Promise<void> {
  await updateConfig("rtl.mode", mode);
}

export function describeMode(mode: RtlMode): string {
  switch (mode) {
    case "off": return "off";
    case "active": return "active (toggle button)";
    case "always": return "always on";
    case "auto": return "auto-detect";
  }
}
