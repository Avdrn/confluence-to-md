/** How a long-running sync tells the UI where it is. */
export interface ProgressReporter {
  phase(text: string): void;
  step(done: number, total: number): void;
}

export const SILENT_PROGRESS: ProgressReporter = {
  phase: (): void => {},
  step: (): void => {}
};
