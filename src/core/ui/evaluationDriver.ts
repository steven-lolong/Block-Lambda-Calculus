import * as Blockly from 'blockly';

export type LambdaStructuralEvent = {
  type?: string;
  element?: string;
  blockId?: string;
  ids?: string[];
};

type DriverOptions = {
  onSettled: (events: LambdaStructuralEvent[]) => void;
  onViewport?: () => void;
};

let driverRunning = false;
let evaluationScheduled = false;
let pendingEvents: LambdaStructuralEvent[] = [];

export function isLambdaStructuralEvent(event: LambdaStructuralEvent | null | undefined): boolean {
  if (!event) return true;
  const type = event.type;

  if (type === Blockly.Events.VIEWPORT_CHANGE) return false;
  if (type === 'move' || type === 'create' || type === 'delete' || type === 'finished_loading') return true;
  if (type === 'block_field_intermediate_change') return true;
  if (type === 'change') return event.element !== 'comment';

  return false;
}

function scheduleEvaluation(event: LambdaStructuralEvent, onSettled: (events: LambdaStructuralEvent[]) => void): void {
  pendingEvents.push(event);
  if (evaluationScheduled || driverRunning) return;

  evaluationScheduled = true;
  queueMicrotask(() => {
    evaluationScheduled = false;
    const events = pendingEvents;
    pendingEvents = [];

    driverRunning = true;
    try {
      onSettled(events);
    } finally {
      driverRunning = false;
    }
  });
}

export function installLambdaEvaluationDriver(workspace: Blockly.WorkspaceSvg, options: DriverOptions): void {
  workspace.addChangeListener((event: Blockly.Events.Abstract) => {
    if (driverRunning) return;

    const lambdaEvent = event as LambdaStructuralEvent;
    if (lambdaEvent.type === Blockly.Events.VIEWPORT_CHANGE) {
      options.onViewport?.();
      return;
    }

    if (!isLambdaStructuralEvent(lambdaEvent)) return;
    scheduleEvaluation(lambdaEvent, options.onSettled);
  });
}
