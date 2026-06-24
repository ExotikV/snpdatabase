import type { ScheduleStep } from "./api";

export function sortStepsBySequence(steps: ScheduleStep[]): ScheduleStep[] {
  return [...steps].sort((a, b) => a.sequence_number - b.sequence_number);
}

export function renumberSteps(steps: ScheduleStep[]): ScheduleStep[] {
  return steps.map((step, index) => ({
    ...step,
    sequence_number: index + 1,
  }));
}

/** Move one step before another (drag-and-drop). */
export function reorderStepsByIds(
  steps: ScheduleStep[],
  draggedId: string,
  targetId: string,
): ScheduleStep[] {
  const sorted = sortStepsBySequence(steps);
  const fromIndex = sorted.findIndex((step) => step.id === draggedId);
  const toIndex = sorted.findIndex((step) => step.id === targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return steps;
  }

  const next = [...sorted];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return renumberSteps(next);
}

/** Insert a step at a new position; other steps shift up or down. */
export function moveStepToSequenceNumber(
  steps: ScheduleStep[],
  stepId: string,
  newSequenceNumber: number,
): ScheduleStep[] {
  const sorted = sortStepsBySequence(steps);
  const fromIndex = sorted.findIndex((step) => step.id === stepId);

  if (fromIndex === -1) {
    return steps;
  }

  const targetIndex = Math.max(
    0,
    Math.min(sorted.length - 1, Math.round(newSequenceNumber) - 1),
  );

  const next = [...sorted];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, moved);
  return renumberSteps(next);
}

export function removeStepAndRenumber(
  steps: ScheduleStep[],
  stepId: string,
): ScheduleStep[] {
  return renumberSteps(sortStepsBySequence(steps).filter((step) => step.id !== stepId));
}
