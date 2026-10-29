import { useId, type Ref } from "react";
import { CellClayDefs, CellShapePaint, cellPaintId, type CellVariant } from "./CellPaint";
import {
    HAPPY_CELL_REST,
    HAPPY_CELL_SHAPE,
    happyCellPaths,
    happyCellSeeded,
    type HappyCellShape,
} from "./happyCellGeometry";

export type HappyCellSize = 16 | 20 | 24 | 64;

export interface HappyCellProps {
    /** 16 inline, 20 in a sidebar row, 24 in a chat author slot or header, 64 in an empty state. */
    size: HappyCellSize;
    /** Clay by default, matching the clay icons beside it; flat is a plain fill. */
    variant?: CellVariant;
    /**
     * How far the cell has divided: 0 is one stem cell, 1 two separate ones.
     * Happy rests just past the start.
     */
    divide?: number;
    /** How the two halves are drawn. Happy's own shape when left out. */
    shape?: HappyCellShape;
    /**
     * The membrane seed, when it has changed since `shape`: Happy forms again
     * from a new one each time it divides (see `HappyCellDivision`'s `onSeed`).
     */
    seed?: number;
    /** Slowly drift the lobes. Static by default and in Blueprint captures. */
    wobble?: boolean;
    ref?: Ref<SVGSVGElement>;
}

/**
 * C-319 — Happy's mark: a cell just starting to divide — two bumpy oval
 * lobes, each with its core, pinched by a soft waist. Painted
 * with the stem cell's own colours, so Happy is the cell new work comes from.
 */
export function HappyCell({
    size,
    variant = "clay",
    divide = HAPPY_CELL_REST,
    shape: given = HAPPY_CELL_SHAPE,
    seed,
    wobble = false,
    ref,
}: HappyCellProps) {
    const shape = happyCellSeeded(given, seed ?? given.seed);
    const clay = cellPaintId(useId());
    const paint = variant === "clay" ? clay : undefined;
    const rest = happyCellPaths(shape, size, divide);
    const forward = wobble ? happyCellPaths(shape, size, divide, 0.2) : undefined;
    const backward = wobble ? happyCellPaths(shape, size, divide, -0.2) : undefined;
    const part = (part: "membrane" | "core") => ({
        className: `happy-stem-cell__${part}`,
        d: rest[part],
        drift:
            forward && backward ? { forward: forward[part], backward: backward[part] } : undefined,
    });
    return (
        <svg
            aria-hidden="true"
            className="happy-cell happy-cell-paint"
            data-happy-desktop-ui="happy-cell"
            data-variant={variant}
            data-wobble={wobble ? "" : undefined}
            focusable="false"
            height={size}
            ref={ref}
            viewBox={`0 0 ${size} ${size}`}
            width={size}
        >
            {paint ? <CellClayDefs id={paint} size={size} /> : null}
            <CellShapePaint clay={paint} shape={part("membrane")} />
            <CellShapePaint clay={paint} inset shape={part("core")} />
        </svg>
    );
}
