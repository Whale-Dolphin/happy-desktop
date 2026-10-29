import { useId, type Ref } from "react";
import { CellClayDefs, CellShapePaint, cellPaintId, type CellVariant } from "./CellPaint";
import { stemCellGeometry, stemCellSmoothPath } from "./stemCellGeometry";

export type StemCellMark = {
    /** Stable item identity, retained while the item takes shape. */
    id: string;
    /** Slowly drift the shape's phases. Static by default and in Blueprint captures. */
    wobble?: boolean;
    /** Clay by default, lit like the clay icons it grows into; flat is a plain fill. */
    variant?: CellVariant;
};
export type StemCellProps = StemCellMark & {
    size: 16 | 20 | 64;
    ref?: Ref<SVGSVGElement>;
};

/** C-298 — a seeded identity for work that has not become something yet. */
export function StemCell({ id, size, wobble = false, variant = "clay", ref }: StemCellProps) {
    const clay = cellPaintId(useId());
    const geometry = stemCellGeometry(id);
    const forward = wobble ? stemCellGeometry(id, 0.2) : undefined;
    const backward = wobble ? stemCellGeometry(id, -0.2) : undefined;
    const shape = (part: "membrane" | "core") => ({
        className: `happy-stem-cell__${part}`,
        d: stemCellSmoothPath(geometry[part], size),
        drift:
            forward && backward
                ? {
                      forward: stemCellSmoothPath(forward[part], size),
                      backward: stemCellSmoothPath(backward[part], size),
                  }
                : undefined,
    });
    const paint = variant === "clay" ? clay : undefined;
    return (
        <svg
            aria-hidden="true"
            className="happy-stem-cell happy-cell-paint"
            data-happy-desktop-ui="stem-cell"
            data-stem-cell-id={id}
            data-variant={variant}
            data-wobble={wobble ? "" : undefined}
            focusable="false"
            height={size}
            ref={ref}
            viewBox={`0 0 ${size} ${size}`}
            width={size}
        >
            {paint ? <CellClayDefs id={paint} size={size} /> : null}
            <CellShapePaint clay={paint} shape={shape("membrane")} />
            <CellShapePaint clay={paint} inset shape={shape("core")} />
        </svg>
    );
}
