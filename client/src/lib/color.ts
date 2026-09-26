/**
 * Translucent tint of any CSS colour, including `var(--x)` tokens. A hex-alpha
 * suffix (`color + "1a"`) only works on literal hex and silently yields invalid
 * CSS for the token strings every colour map in this app holds.
 */
export function tint(color: string, percent = 10): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
