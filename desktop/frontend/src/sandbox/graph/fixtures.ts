import type { Glyph } from "../../components/graph/svg/types";
export interface SampleRow {
  label: string;
  hash: string;
  cells: Glyph[];
}
const mint = "#48bea1",
  violet = "#a592f5",
  gold = "#e1ac54",
  blue = "#64a7ed";
function row(label: string, cells: Record<number, Glyph>, index: number): SampleRow {
  return {
    label,
    hash: `c0ffee${index}`,
    cells: Array.from({ length: 12 }, (_, i) => cells[i] ?? { kind: "empty" }),
  };
}
const main = (kind: Glyph["kind"], extra: Partial<Glyph> = {}): Glyph => ({
  kind,
  color: mint,
  ...extra,
});
const side = (kind: Glyph["kind"], extra: Partial<Glyph> = {}): Glyph => ({
  kind,
  color: violet,
  ...extra,
});
export const fixtures: Record<string, { description: string; rows: SampleRow[] }> = {
  "Branch and merge": {
    description:
      "Working changes connect to HEAD. A merge opens a side lane, which rejoins at its common ancestor.",
    rows: [
      row("Working changes", { 1: main("unstaged-node", { bottom: true }) }, 1),
      row("HEAD · polish graph styles", { 1: main("head-node", { top: true, bottom: true }) }, 2),
      row(
        "Merge branch “svg-playground”",
        {
          1: main("merge-node", { top: true, bottom: true, right: true }),
          2: side("horizontal"),
          3: side("horizontal"),
          4: side("top-right"),
        },
        3,
      ),
      row(
        "Add reusable SVG components",
        { 1: main("vertical"), 4: side("node", { top: true, bottom: true }) },
        4,
      ),
      row(
        "Common ancestor",
        {
          1: main("node", { top: true, bottom: true, right: true }),
          2: side("horizontal"),
          3: side("horizontal"),
          4: side("bot-right"),
        },
        5,
      ),
      row("Initial commit", { 1: main("node", { top: true }) }, 6),
    ],
  },
  "Merge into a continuing branch": {
    description:
      "The secondary parent already has an active rail. Its curved merge arm joins that rail without interrupting its continuation above or below.",
    rows: [
      row(
        "Independent tips",
        { 1: main("head-node", { bottom: true }), 4: side("node", { bottom: true }) },
        1,
      ),
      row(
        "Merge an already-active parent",
        {
          1: main("merge-node", { top: true, bottom: true, right: true }),
          2: side("horizontal"),
          3: side("horizontal"),
          4: side("vert-left"),
        },
        2,
      ),
      row(
        "Continuing branch commit",
        { 1: main("vertical"), 4: side("node", { top: true, bottom: true }) },
        3,
      ),
      row("History continues below…", { 1: main("vertical"), 4: side("vertical") }, 4),
    ],
  },
  "Crossing unrelated lanes": {
    description:
      "The violet edge crosses gold and blue rails without joining them. Each edge retains its own color.",
    rows: [
      row(
        "Three independent tips",
        {
          1: main("head-node", { bottom: true }),
          4: { kind: "vertical", color: gold },
          7: { kind: "vertical", color: blue },
        },
        1,
      ),
      row(
        "Merge across two active lanes",
        {
          1: main("merge-node", { top: true, bottom: true, right: true }),
          2: side("horizontal"),
          3: side("horizontal"),
          4: { kind: "cross", color: gold, crossingColor: violet },
          5: side("horizontal"),
          6: side("horizontal"),
          7: { kind: "cross", color: blue, crossingColor: violet },
          8: side("horizontal"),
          9: side("horizontal"),
          10: side("top-right"),
        },
        2,
      ),
      row(
        "Side branch commit",
        {
          1: main("vertical"),
          4: { kind: "vertical", color: gold },
          7: { kind: "vertical", color: blue },
          10: side("node", { top: true, bottom: true }),
        },
        3,
      ),
      row(
        "History continues below…",
        {
          1: main("vertical"),
          4: { kind: "vertical", color: gold },
          7: { kind: "vertical", color: blue },
          10: side("vertical"),
        },
        4,
      ),
    ],
  },
  "Merge on both sides": {
    description:
      "A local routing example: both horizontal ports must remain connected when secondary parents lie on opposite sides.",
    rows: [
      row("Merge tip", { 4: main("head-node", { bottom: true }) }, 1),
      row(
        "Three-parent merge",
        {
          1: side("top-left"),
          2: side("horizontal"),
          3: side("horizontal"),
          4: main("merge-node", { top: true, bottom: true, left: true, right: true }),
          5: { kind: "horizontal", color: gold },
          6: { kind: "horizontal", color: gold },
          7: { kind: "top-right", color: gold },
        },
        2,
      ),
      row(
        "Parent lanes continue…",
        { 1: side("vertical"), 4: main("vertical"), 7: { kind: "vertical", color: gold } },
        3,
      ),
    ],
  },
};
