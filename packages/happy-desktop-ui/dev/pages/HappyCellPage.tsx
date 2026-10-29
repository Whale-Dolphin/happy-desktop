import type { ReactNode } from "react";
import crashLarge from "../../src/assets/clay-icons/crash@64.png";
import type { CellVariant } from "../../src/CellPaint";
import { clayIconMark, clayIconMarkLarge, type ClayIconSlug } from "../../src/clayIcons";
import { HappyCell } from "../../src/HappyCell";
import { StemCell } from "../../src/StemCell";
import { createStemCellEngine, stemCellVariantFor } from "../../src/stemCellEngine";
import { stemCellPaletteOf } from "../../src/stemCellPlay";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-319";
const modes = ["light", "dark"] as const;
const variants: readonly CellVariant[] = ["flat", "clay"];
const happySizes = [16, 20, 24, 64] as const;
const stemSizes = [16, 20, 64] as const;
const divides = [0, 0.1, 0.18, 0.3, 0.5, 0.75, 1];
const stemIds = ["window-navigation", "release-note-ideas", "shortcut-ideas"];
const neighbours: readonly ClayIconSlug[] = ["cloud", "notes", "brainstorm", "goals"];

function Labelled(props: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {props.children}
            <DimensionRule label={props.label} />
        </div>
    );
}

/** One appearance's stage, the surface a cell is drawn on in the app. */
function Stage(props: { mode: (typeof modes)[number]; screen: string; children: ReactNode }) {
    return (
        <ThemeScope mode={props.mode}>
            <div
                data-screen={props.screen}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 24,
                    padding: 24,
                    background: "var(--surface)",
                }}
            >
                {props.children}
            </div>
        </ThemeScope>
    );
}

function Row(props: { children: ReactNode }) {
    return <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>{props.children}</div>;
}

/** A sidebar row's geometry: a 32px row, a 20px mark lane, an 8px gap, a 13px label. */
function SidebarRowMock(props: { mark: ReactNode; label: string }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 32,
                padding: "0 8px",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 500,
                lineHeight: "16px",
            }}
        >
            <span style={{ display: "flex", width: 20, justifyContent: "center" }}>
                {props.mark}
            </span>
            {props.label}
        </div>
    );
}

function ClayImage(props: { slug: ClayIconSlug; size: 20 | 64 }) {
    const mark =
        props.size === 20
            ? clayIconMark(props.slug)
            : { ...clayIconMarkLarge(props.slug), srcSet: undefined };
    return (
        <img
            alt=""
            src={mark.src}
            srcSet={mark.srcSet}
            style={{ display: "block", width: props.size, height: props.size }}
        />
    );
}

const handoverId = "window-navigation";
/** Moments of the 240 ms handover: the clay cell fading over the engine's first frames. */
const handoverTimes = [0, 60, 120, 180, 240];

/**
 * The growth's first frames drawn by the engine, with the clay cell laid over
 * each at the opacity the handover fade gives it then. Nothing here moves.
 */
function HandoverFrames(props: { size: 20 | 64 }) {
    const draw = (strip: HTMLDivElement | null) => {
        if (!strip) return;
        const image = new Image();
        image.src = crashLarge;
        void image
            .decode()
            .then(() => {
                const device = props.size * 2;
                const source = document.createElement("canvas");
                const engine = createStemCellEngine(source, {
                    id: handoverId,
                    size: device,
                    palette: stemCellPaletteOf(strip),
                    variant: stemCellVariantFor(props.size),
                    allowSoftware: true,
                });
                engine.assign(image);
                for (const target of strip.querySelectorAll("canvas")) {
                    engine.render(Number(target.dataset.ms));
                    target.width = target.height = device;
                    target.getContext("2d")?.drawImage(source, 0, 0);
                }
                engine.destroy();
            })
            .catch(() => {
                // No WebGL2 at all: the strip shows the clay cells alone.
            });
    };
    return (
        <div ref={draw} style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            {handoverTimes.map((ms) => (
                <Labelled key={ms} label={`${ms} ms`}>
                    <div style={{ position: "relative", width: props.size, height: props.size }}>
                        <canvas
                            data-ms={ms}
                            style={{
                                position: "absolute",
                                inset: 0,
                                width: props.size,
                                height: props.size,
                            }}
                        />
                        <div style={{ position: "absolute", inset: 0, opacity: 1 - ms / 240 }}>
                            <StemCell id={handoverId} size={props.size} />
                        </div>
                    </div>
                </Labelled>
            ))}
        </div>
    );
}

export function HappyCellPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Happy cell"
            summary="Happy’s mark: a stem cell just starting to divide, read as a puffy H — two fat lobes, each with its core, pinched by a shallow waist. It is cut from the stem cell model and painted in the stem cell’s own colours, so Happy is the cell new work comes from. One divide parameter runs from one cell (0) to two (1); Happy rests at 0.18. Every cell comes flat or in clay; clay, the default, is lit like the clay icon library."
        >
            {modes.map((mode, index) => (
                <Specimen
                    key={`happy-${mode}`}
                    number={`0${index + 1}`}
                    label={`${mode} · Happy · flat / clay · 16 / 20 / 24 / 64`}
                    detail="Inline, sidebar row, chat author slot or header, empty state"
                    stage="app"
                >
                    <Stage mode={mode} screen={`happy-cell-${mode}`}>
                        {variants.map((variant) => (
                            <Row key={variant}>
                                {happySizes.map((size) => (
                                    <Labelled key={size} label={`${variant} ${size}`}>
                                        <HappyCell size={size} variant={variant} wobble />
                                    </Labelled>
                                ))}
                            </Row>
                        ))}
                    </Stage>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`divide-${mode}`}
                    number={`D${index + 1}`}
                    label={`${mode} · divide 0 → 1 · 64`}
                    detail="The one parameter Happy is drawn from: one stem cell at 0, two at 1, Happy at rest at 0.18"
                    stage="app"
                >
                    <Stage mode={mode} screen={`divide-sweep-${mode}`}>
                        <Row>
                            {divides.map((divide) => (
                                <Labelled key={divide} label={divide.toFixed(2)}>
                                    <HappyCell divide={divide} size={64} />
                                </Labelled>
                            ))}
                        </Row>
                    </Stage>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`stem-${mode}`}
                    number={`0${index + 3}`}
                    label={`${mode} · stem cells · flat / clay · 16 / 20 / 64`}
                    detail="The same seeded stem cells in both paints"
                    stage="app"
                >
                    <Stage mode={mode} screen={`stem-cell-${mode}`}>
                        {variants.map((variant) => (
                            <Row key={variant}>
                                {stemIds.map((id) =>
                                    stemSizes.map((size) => (
                                        <Labelled
                                            key={`${id}-${size}`}
                                            label={`${variant} ${size}`}
                                        >
                                            <StemCell id={id} size={size} variant={variant} />
                                        </Labelled>
                                    )),
                                )}
                            </Row>
                        ))}
                    </Stage>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`material-${mode}`}
                    number={`0${index + 5}`}
                    label={`${mode} · material · beside clay icons · 20 / 64`}
                    detail="Clay cells next to the clay icons they share a sidebar with"
                    stage="app"
                >
                    <Stage mode={mode} screen={`material-${mode}`}>
                        {([64, 20] as const).map((size) => (
                            <Row key={size}>
                                <Labelled label="Happy">
                                    <HappyCell size={size} />
                                </Labelled>
                                <Labelled label="stem cell">
                                    <StemCell id="window-navigation" size={size} />
                                </Labelled>
                                {neighbours.map((slug) => (
                                    <Labelled key={slug} label={slug}>
                                        <ClayImage size={size} slug={slug} />
                                    </Labelled>
                                ))}
                            </Row>
                        ))}
                    </Stage>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`rows-${mode}`}
                    number={`0${index + 7}`}
                    label={`${mode} · sidebar rows · flat / clay`}
                    detail="Row geometry only: Happy on top, unformed work as stem cells, formed work in its clay icon"
                    stage="app"
                >
                    <Stage mode={mode} screen={`sidebar-rows-${mode}`}>
                        <div style={{ display: "flex", gap: 48 }}>
                            {variants.map((variant) => (
                                <div
                                    key={variant}
                                    style={{ display: "flex", flexDirection: "column", width: 240 }}
                                >
                                    <SidebarRowMock
                                        label="Happy"
                                        mark={<HappyCell size={20} variant={variant} />}
                                    />
                                    <SidebarRowMock
                                        label="Window navigation"
                                        mark={
                                            <StemCell
                                                id="window-navigation"
                                                size={20}
                                                variant={variant}
                                            />
                                        }
                                    />
                                    <SidebarRowMock
                                        label="Release note ideas"
                                        mark={
                                            <StemCell
                                                id="release-note-ideas"
                                                size={20}
                                                variant={variant}
                                            />
                                        }
                                    />
                                    <SidebarRowMock
                                        label="Cloud costs"
                                        mark={<ClayImage size={20} slug="cloud" />}
                                    />
                                    <SidebarRowMock
                                        label="Meeting notes"
                                        mark={<ClayImage size={20} slug="notes" />}
                                    />
                                    <DimensionRule label={variant} />
                                </div>
                            ))}
                        </div>
                    </Stage>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`handover-${mode}`}
                    number={`0${index + 9}`.slice(-2)}
                    label={`${mode} · growth handover · 20 / 64`}
                    detail="A clay stem cell fades over the growth's flat founding cell for 240 ms once the first frame is drawn"
                    stage="app"
                >
                    <Stage mode={mode} screen={`growth-handover-${mode}`}>
                        <HandoverFrames size={20} />
                        <HandoverFrames size={64} />
                    </Stage>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
