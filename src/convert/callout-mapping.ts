/**
 * The one place that knows which Obsidian callout a Confluence panel becomes.
 */

/** The callout types Obsidian renders natively. */
export enum ObsidianCalloutType {
  NOTE = 'NOTE',
  INFO = 'INFO',
  TIP = 'TIP',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  DANGER = 'DANGER',
  IMPORTANT = 'IMPORTANT',
  CAUTION = 'CAUTION'
}

const PANEL_TO_CALLOUT: ReadonlyMap<string, ObsidianCalloutType> = new Map<string, ObsidianCalloutType>([
  ['info', ObsidianCalloutType.INFO],
  ['note', ObsidianCalloutType.NOTE],
  ['tip', ObsidianCalloutType.TIP],
  ['success', ObsidianCalloutType.SUCCESS],
  ['warning', ObsidianCalloutType.WARNING],
  ['error', ObsidianCalloutType.DANGER],
  ['caution', ObsidianCalloutType.CAUTION],
  ['attention', ObsidianCalloutType.WARNING],
  ['important', ObsidianCalloutType.IMPORTANT],
  ['panel', ObsidianCalloutType.NOTE],
  ['custom', ObsidianCalloutType.NOTE]
]);

/** The callout a Confluence panel becomes; unknown panels become NOTE. */
export function calloutForPanel(panelName: string): ObsidianCalloutType {
  return PANEL_TO_CALLOUT.get(panelName.toLowerCase()) ?? ObsidianCalloutType.NOTE;
}

/** True for every panel macro name this mapping knows. */
export function isPanelMacro(macroName: string): boolean {
  return PANEL_TO_CALLOUT.has(macroName.toLowerCase());
}
