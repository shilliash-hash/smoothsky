/** Presentation only: never use the result as a database key or mutation payload. */
export function displayTerminology(text: string): string {
  return text
    .replace(/\bForward Operating Bases\b/gi, "Fixed-Base Operators")
    .replace(/\bForward Operating Base\b/gi, "Fixed-Base Operator")
    .replace(/\bFOBs\b/gi, "FBOs")
    .replace(/\bFOB\b/gi, "FBO");
}