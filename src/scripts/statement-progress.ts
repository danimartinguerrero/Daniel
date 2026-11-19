export function statementProgress(top: number, travel: number) {
  return Math.min(1, Math.max(0, -top / (Math.max(1, travel) * .8)));
}
