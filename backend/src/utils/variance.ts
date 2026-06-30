/** Pure variance math shared by the actuals service and tests. */
export function computeShortage(planned: number, actual: number): number {
  return Math.max(planned - actual, 0);
}

export function computeExcess(planned: number, actual: number): number {
  return Math.max(actual - planned, 0);
}

export function variance(planned: number, actual: number) {
  return { planned, actual, shortage: computeShortage(planned, actual), excess: computeExcess(planned, actual) };
}
