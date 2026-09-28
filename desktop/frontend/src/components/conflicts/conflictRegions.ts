export interface ResolutionRegion {
  start: number;
  end: number;
  current: string;
  incoming: string;
  base: string;
}
// Preserve offsets and line endings: choices affect only the selected region.
export function conflictRegions(content: string, size = 7): ResolutionRegion[] {
  const regions: ResolutionRegion[] = [];
  const startMarker = "<".repeat(size),
    baseMarker = "|".repeat(size),
    endMarker = ">".repeat(size),
    separator = "=".repeat(size);
  let region: ResolutionRegion | null = null;
  let side: "current" | "incoming" | "base" = "current";
  let separated = false;
  for (const match of content.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = match[0];
    if (!line) continue;
    if (line.startsWith(startMarker)) {
      region = { start: match.index!, end: 0, current: "", incoming: "", base: "" };
      side = "current";
      separated = false;
    } else if (region && line.startsWith(baseMarker)) side = "base";
    else if (region && line.trimEnd() === separator) {
      side = "incoming";
      separated = true;
    } else if (region && line.startsWith(endMarker)) {
      region.end = match.index! + line.length;
      if (separated) regions.push(region);
      region = null;
    } else if (region) region[side] += line;
  }
  return regions;
}
export function resolveRegion(
  content: string,
  region: ResolutionRegion,
  choice: "current" | "incoming" | "both",
): string {
  let replacement = choice === "both" ? region.current + region.incoming : region[choice];
  if (region.end === content.length && !content.endsWith("\n"))
    replacement = replacement.replace(/\r?\n$/, "");
  return content.slice(0, region.start) + replacement + content.slice(region.end);
}
export function hasConflictMarkers(content: string, size = 7): boolean {
  return content
    .split("\n")
    .some((line) => ["<", "|", "=", ">"].some((char) => line.startsWith(char.repeat(size))));
}
