import * as Blockly from 'blockly';
import { annotateLambdaWorkspaceTypes, type LambdaInferenceReport } from './lambdaTypeInference';

export type LambdaInferenceStats = {
  mode: 'full' | 'incremental';
  totalBlocks: number;
  dirtyBlocks: number;
  passes: number;
  elapsedMs: number;
  reason?: string;
};

export type LambdaStructuralEvent = {
  type?: string;
  element?: string;
  blockId?: string;
  ids?: string[];
  newParentId?: string;
  oldParentId?: string;
  newInputName?: string;
  oldInputName?: string;
};

type DriverOptions = {
  onSettled: (report: LambdaInferenceReport, events: LambdaStructuralEvent[]) => void;
  onViewport?: () => void;
  onPassiveMove?: () => void;
};

type LambdaTypedBlock = Blockly.Block & {
  termType?: string;
  termScheme?: string;
  termTypeHasNoError?: boolean;
  isComplete?: boolean;
};

const MAX_PASSES = 8;

let driverRunning = false;
let sweepScheduled = false;
let pendingWorkspace: Blockly.Workspace | null = null;
let pendingEvents: LambdaStructuralEvent[] = [];
let driverWorkspace: Blockly.Workspace | null = null;
let onSettled: DriverOptions['onSettled'] | null = null;
let onViewport: DriverOptions['onViewport'] | null = null;
let onPassiveMove: DriverOptions['onPassiveMove'] | null = null;
let lastInferenceStats: LambdaInferenceStats = {
  mode: 'full',
  totalBlocks: 0,
  dirtyBlocks: 0,
  passes: 0,
  elapsedMs: 0,
  reason: 'not-run'
};

export function isLambdaStructuralEvent(event: LambdaStructuralEvent | null | undefined): boolean {
  if (!event) return true;
  const type = event.type;

  if (type === Blockly.Events.VIEWPORT_CHANGE) return false;
  // A move only changes term structure when a connection changes; dragging a
  // block to a new position keeps types, values, and generated code identical.
  if (type === 'move') {
    return event.oldParentId !== event.newParentId || event.oldInputName !== event.newInputName;
  }
  if (type === 'create' || type === 'delete' || type === 'finished_loading') return true;
  if (type === 'block_field_intermediate_change') return true;
  if (type === 'change') return event.element !== 'comment';

  return false;
}

export function getLastLambdaInferenceStats(): LambdaInferenceStats {
  return { ...lastInferenceStats };
}

function isLambdaBlock(block: Blockly.Block): block is LambdaTypedBlock {
  return Boolean(block.outputConnection) && block.type.startsWith('lambda_') && block.type !== 'lambda_viz_description';
}

function snapshot(blocks: LambdaTypedBlock[]): string {
  return blocks
    .map((block) => [
      block.id,
      block.termType ?? '_',
      block.termScheme ?? '_',
      block.termTypeHasNoError === false ? '0' : '1',
      block.isComplete === false ? '0' : '1'
    ].join('|'))
    .join(';');
}

function runFullInference(workspace: Blockly.Workspace, reason?: string): LambdaInferenceReport {
  const start = Date.now();
  const blocks = workspace.getAllBlocks(false).filter(isLambdaBlock);
  let passes = 0;
  // Seed with the current annotations so an already-settled workspace needs a
  // single pass; a changed workspace settles on the second.
  let previous: string | null = snapshot(blocks);
  let report: LambdaInferenceReport | null = null;

  Blockly.Events.disable();
  try {
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      passes = pass + 1;
      report = annotateLambdaWorkspaceTypes(workspace);
      const next = snapshot(blocks);
      if (next === previous) break;
      previous = next;
    }
  } finally {
    Blockly.Events.enable();
  }

  lastInferenceStats = {
    mode: 'full',
    totalBlocks: blocks.length,
    dirtyBlocks: blocks.length,
    passes,
    elapsedMs: Date.now() - start,
    reason
  };
  return report ?? annotateLambdaWorkspaceTypes(workspace);
}

function emitSettled(workspace: Blockly.Workspace, report: LambdaInferenceReport, events: LambdaStructuralEvent[]): void {
  if (onSettled && (driverWorkspace === null || workspace === driverWorkspace)) {
    onSettled(report, events);
  }
}

export function runLambdaInferenceToFixpoint(workspace: Blockly.Workspace, reason = 'explicit-full'): LambdaInferenceReport {
  if (driverRunning) return annotateLambdaWorkspaceTypes(workspace);
  driverRunning = true;
  try {
    const report = runFullInference(workspace, reason);
    emitSettled(workspace, report, []);
    return report;
  } finally {
    driverRunning = false;
  }
}

function runInferenceForEvents(workspace: Blockly.Workspace, events: LambdaStructuralEvent[]): void {
  if (driverRunning) return;
  driverRunning = true;
  try {
    const report = runFullInference(workspace, events.some((event) => event.type === 'finished_loading') ? 'finished-loading' : 'structural-change');
    lastInferenceStats = { ...lastInferenceStats, mode: 'incremental' };
    emitSettled(workspace, report, events);
  } finally {
    driverRunning = false;
  }
}

function scheduleInference(workspace: Blockly.Workspace, event: LambdaStructuralEvent): void {
  pendingWorkspace = workspace;
  pendingEvents.push(event);
  if (sweepScheduled || driverRunning) return;

  sweepScheduled = true;
  queueMicrotask(() => {
    sweepScheduled = false;
    const workspaceToRun = pendingWorkspace;
    const events = pendingEvents;
    pendingWorkspace = null;
    pendingEvents = [];
    if (workspaceToRun) runInferenceForEvents(workspaceToRun, events);
  });
}

export function installLambdaInferenceDriver(workspace: Blockly.Workspace, options: DriverOptions): void {
  driverWorkspace = workspace;
  onSettled = options.onSettled;
  onViewport = options.onViewport ?? null;
  onPassiveMove = options.onPassiveMove ?? null;

  workspace.addChangeListener((event: Blockly.Events.Abstract) => {
    if (driverRunning) return;
    const lambdaEvent = event as LambdaStructuralEvent;

    if (lambdaEvent.type === Blockly.Events.VIEWPORT_CHANGE) {
      onViewport?.();
      return;
    }

    if (!isLambdaStructuralEvent(lambdaEvent)) {
      if (lambdaEvent.type === 'move') onPassiveMove?.();
      return;
    }
    scheduleInference(workspace, lambdaEvent);
  });
}
