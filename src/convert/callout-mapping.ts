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

/**
 * The panel macro a callout becomes on push: the table above read backwards,
 * with one answer per callout, plus Obsidian's other built-in callouts mapped
 * to the nearest of the four legacy panels Confluence Cloud still accepts.
 */
const CALLOUT_TO_PANEL: ReadonlyMap<string, string> = new Map<string, string>([
  ['info', 'info'], ['note', 'note'], ['tip', 'tip'], ['warning', 'warning'],
  ['success', 'tip'], ['danger', 'warning'], ['caution', 'warning'], ['important', 'note'],
  ['abstract', 'info'], ['summary', 'info'], ['tldr', 'info'], ['todo', 'info'], ['example', 'info'],
  ['hint', 'tip'], ['check', 'tip'], ['done', 'tip'],
  ['question', 'note'], ['help', 'note'], ['faq', 'note'], ['quote', 'note'], ['cite', 'note'],
  ['attention', 'warning'], ['failure', 'warning'], ['fail', 'warning'], ['missing', 'warning'],
  ['error', 'warning'], ['bug', 'warning']
]);

/** The panel macro for a callout type; anything unknown becomes a note panel. */
export function panelForCallout(calloutType: string): string {
  return CALLOUT_TO_PANEL.get(calloutType.toLowerCase()) ?? 'note';
}
