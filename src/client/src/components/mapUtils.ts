export const MOOD_COLORS: Record<string, string> = {
  energetic: "#f97316",
  dark: "#7c3aed",
  chill: "#3b82f6",
  happy: "#eab308",
  sad: "#64748b",
  calm: "#93c5fd",
  epic: "#ef4444",
  uplifting: "#22c55e",
  scary: "#991b1b",
  romantic: "#ec4899",
  aggressive: "#ea580c",
  sexy: "#db2777",
  ethereal: "#a78bfa",
}

export const TRACK_PALETTE = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#ec4899",
  "#eab308",
  "#a78bfa",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#f43f5e",
]

export function trackColor(index: number): string {
  return TRACK_PALETTE[index % TRACK_PALETTE.length]
}

export interface TrackData {
  id: string
  score: number
  mood: string[]
  genre: string[]
  moodScores: Record<string, number>
  color: string
}

export function moodColor(moods: string[]): string {
  for (const m of moods) if (MOOD_COLORS[m]) return MOOD_COLORS[m]
  return "#94a3b8"
}

export interface DiffLabel {
  tag: string
  direction: "more" | "less"
  label: string // e.g. "more happy"
}

/** Assign a unique tag axis to each outer node, greedy by largest delta. */
export function assignDiffTags(
  center: Record<string, number>,
  others: Record<string, number>[],
): DiffLabel[] {
  const used = new Set<string>()
  return others.map((other) => {
    const tags = new Set([...Object.keys(center), ...Object.keys(other)])
    let maxDiff = -1
    let bestTag = ""
    for (const t of tags) {
      if (used.has(t)) continue
      const diff = Math.abs((center[t] ?? 0) - (other[t] ?? 0))
      if (diff > maxDiff) { maxDiff = diff; bestTag = t }
    }
    used.add(bestTag)
    const direction: "more" | "less" = (other[bestTag] ?? 0) > (center[bestTag] ?? 0) ? "more" : "less"
    return { tag: bestTag, direction, label: `${direction} ${bestTag}` }
  })
}

export function outerPos(i: number, total: number, cx: number, cy: number, radius: number) {
  const angle = (2 * Math.PI * i) / total - Math.PI / 2
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

export function shortenLine(
  x1: number, y1: number,
  x2: number, y2: number,
  byStart: number, byEnd: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len, uy = dy / len
  return { x1: x1 + ux * byStart, y1: y1 + uy * byStart, x2: x2 - ux * byEnd, y2: y2 - uy * byEnd }
}

export function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}
