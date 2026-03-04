import { MASCOTS, BACKGROUND_COLORS, type MascotId, type BackgroundId } from "../config.ts";

export function isMascotId(value: string): value is MascotId {
  return value in MASCOTS;
}

export function isBackgroundId(value: string): value is BackgroundId {
  return value in BACKGROUND_COLORS;
}