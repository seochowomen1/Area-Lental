export type ClassValue = string | number | null | undefined | false;

/**
 * Tiny className combiner (no external deps).
 * - falsy values are ignored
 * - numbers are stringified
 */
export function cn(...values: ClassValue[]) {
  return values
    .filter((v) => v !== null && v !== undefined && v !== false && v !== "")
    .map((v) => String(v))
    .join(" ");
}
