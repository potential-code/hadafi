/**
 * Category values from Hadafi's AI analytics views are codes such as
 * "blended_learning" or "content_on_demand". Show them as words in charts.
 * Anything that isn't a snake_case code (names, dates, numbers) is left alone.
 */
export function humanLabel(value: string): string {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)) return value
  return value
    .split('_')
    .map((w) => (w.length > 2 || w === 'ai' ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replace(/\bAi\b/g, 'AI')
}
