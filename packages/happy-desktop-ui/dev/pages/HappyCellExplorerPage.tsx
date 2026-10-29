import {
    useId,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent,
    type ReactNode,
} from "react";
import { CellClayDefs, cellClayFilter, cellPaintId } from "../../src/CellPaint";
import { clayIconMark, type ClayIconSlug } from "../../src/clayIcons";
import { HappyCell } from "../../src/HappyCell";
import { HappyCellDivisionSim, type DivisionRect } from "../../src/happyCellDivisionSim";
import {
    HAPPY_CELL_SHAPE,
    happyCellNextSeed,
    happyCellSeeded,
    type HappyCellShape,
} from "../../src/happyCellGeometry";
import { StemCell } from "../../src/StemCell";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, Specimen } from "../kit";
import { happyCellSpace, type HappyCellSpace } from "./happyCellSpace";

export const componentNumber = "C-319d";
type Mode = "light" | "dark";
type Cell = readonly [number, number];

/** A tile of the plane: a 64 px mark over a 20 px one. */
const TILE = { width: 84, height: 104 };
const VIEW = { width: TILE.width * 7, height: TILE.height * 5 };
const HOME: Cell = [-(VIEW.width - TILE.width) / 2, -(VIEW.height - TILE.height) / 2];
const FIRST_SPACE = 536980;
const LIKES_KEY = "happy-cell-explorer/likes";

interface Like {
    readonly id: string;
    /** The plane it was liked on, so its heart shows only there. */
    readonly plane: string;
    readonly cell: Cell;
    readonly shape: HappyCellShape;
    readonly at: number;
}

function likesRead(): Like[] {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(LIKES_KEY) ?? "[]");
        return Array.isArray(stored) ? (stored as Like[]) : [];
    } catch {
        return [];
    }
}

function likesWrite(likes: readonly Like[]): void {
    localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
}

const spaces = new Map<number, HappyCellSpace>();
function spaceOf(seed: number): HappyCellSpace {
    let space = spaces.get(seed);
    if (!space) spaces.set(seed, (space = happyCellSpace(seed)));
    return space;
}

/** One shape object per tile of a plane, so a tile keeps its paths while the plane pans. */
const tileShapes = new Map<string, HappyCellShape>();
function tileShape(
    plane: string,
    space: number,
    centre: HappyCellShape,
    amount: number,
    cell: Cell,
) {
    const key = `${plane}|${cell[0]},${cell[1]}`;
    let shape = tileShapes.get(key);
    if (!shape) {
        // The middle of the plane is the centre itself.
        shape =
            cell[0] === 0 && cell[1] === 0
                ? centre
                : spaceOf(space).at(cell[0], cell[1], centre, amount);
        tileShapes.set(key, shape);
        if (tileShapes.size > 2000) tileShapes.delete(tileShapes.keys().next().value!);
    }
    return shape;
}

const button: CSSProperties = {
    padding: "4px 12px",
    border: "1px solid var(--divider)",
    borderRadius: 999,
    background: "transparent",
    color: "var(--text)",
    font: "inherit",
    fontSize: 12,
    cursor: "pointer",
};

function Tile(props: { shape: HappyCellShape; liked: boolean; selected: boolean; at: Cell }) {
    return (
        <div
            style={{
                position: "absolute",
                left: props.at[0],
                top: props.at[1],
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                width: TILE.width,
                height: TILE.height,
                paddingTop: 6,
                boxSizing: "border-box",
                outline: props.selected ? "1px dashed var(--text-secondary)" : undefined,
                outlineOffset: -3,
                borderRadius: 8,
            }}
        >
            <HappyCell shape={props.shape} size={64} />
            <HappyCell shape={props.shape} size={20} />
            {props.liked ? (
                <span
                    style={{
                        position: "absolute",
                        top: 3,
                        right: 6,
                        color: "var(--stem-cell-core)",
                        fontSize: 12,
                    }}
                >
                    ♥
                </span>
            ) : null}
        </div>
    );
}

/** Wheel panning needs a listener that may cancel the page's own scroll. */
function wheelPan(onPan: (dx: number, dy: number) => void) {
    return (element: HTMLDivElement | null) => {
        if (!element) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const step = event.deltaMode === 1 ? 30 : 1;
            if (event.shiftKey) onPan(event.deltaY * step, 0);
            else onPan(event.deltaX * step, event.deltaY * step);
        };
        element.addEventListener("wheel", wheel, { passive: false });
        return () => element.removeEventListener("wheel", wheel);
    };
}

function ClayMark(props: { slug: ClayIconSlug }) {
    const mark = clayIconMark(props.slug);
    return (
        <img
            alt=""
            src={mark.src}
            srcSet={mark.srcSet}
            style={{ display: "block", width: 20, height: 20 }}
        />
    );
}

function SidebarRow(props: { mark: ReactNode; label: string; selected?: boolean }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 32,
                padding: "0 8px",
                borderRadius: 6,
                background: props.selected ? "var(--surface-pressed)" : undefined,
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 500,
            }}
        >
            <span style={{ display: "flex", width: 20, justifyContent: "center" }}>
                {props.mark}
            </span>
            {props.label}
        </div>
    );
}

/** The selected design where it lives: a sidebar and a chat author line. */
function Preview(props: { shape: HappyCellShape; screen: string }) {
    return (
        <div
            data-screen={props.screen}
            style={{
                display: "flex",
                gap: 24,
                padding: 16,
                borderRadius: 10,
                background: "var(--groupped-background)",
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", width: 220 }}>
                <SidebarRow
                    label="Happy"
                    mark={<HappyCell shape={props.shape} size={20} />}
                    selected
                />
                <SidebarRow
                    label="New chat"
                    mark={<StemCell id={`explorer-${props.shape.seed + 1}`} size={20} />}
                />
                <SidebarRow label="Cloud costs" mark={<ClayMark slug="cloud" />} />
                <SidebarRow label="Release coordinator" mark={<ClayMark slug="ci-watcher" />} />
            </div>
            <div style={{ display: "flex", gap: 8, width: 300 }}>
                <HappyCell shape={props.shape} size={24} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 600 }}>
                            Happy
                        </span>
                        <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>10:42</span>
                    </div>
                    <span style={{ color: "var(--text)", fontSize: 14, lineHeight: "20px" }}>
                        Hi, I’m Happy, your main agent. Which AI do you already pay for?
                    </span>
                </div>
            </div>
        </div>
    );
}

/** Moments of the division drawn in the strip, in ms, with what is happening. */
const STRIP: readonly (readonly [number, string])[] = [
    [0, "Happy"],
    [110, "peels under"],
    [175, "pulls down"],
    [230, "splits"],
];
const STRIP_SIZE = 64;

/** The division of `shape` from `from` to `to`, stepped to each moment of the strip. */
function divisionFrames(shape: HappyCellShape, from: DivisionRect, to: DivisionRect) {
    const sim = new HappyCellDivisionSim(from, shape);
    sim.divide(`explorer-${shape.seed + 1}`, to);
    let now = 0;
    return STRIP.map(([ms, label]) => {
        sim.step((ms - now) / 1000);
        now = ms;
        return { ms, label, frame: sim.frame() };
    });
}

/**
 * One division of the selected design, stepped to fixed moments by the real
 * simulation, then Happy formed again from a new seed beside the new cell.
 */
function DivisionStrip(props: { shape: HappyCellShape; screen: string }) {
    const clay = cellPaintId(useId());
    const size = STRIP_SIZE;
    const pad = Math.round(size * 0.3);
    const from: DivisionRect = { x: pad, y: pad, width: size, height: size };
    const to: DivisionRect = { ...from, y: pad + size * 1.3 };
    const frames = divisionFrames(props.shape, from, to);
    const reformed = happyCellSeeded(props.shape, happyCellNextSeed(props.shape.seed));
    const caption = (text: string) => (
        <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{text}</span>
    );
    return (
        <div
            data-screen={props.screen}
            style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 12,
                padding: 16,
                borderRadius: 10,
                background: "var(--groupped-background)",
            }}
        >
            {frames.map(({ ms, label, frame }, index) => (
                <div
                    key={ms}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    <svg
                        height={to.y + size + pad}
                        style={{ display: "block" }}
                        width={size + 2 * pad}
                    >
                        {index === 0 ? <CellClayDefs id={clay} size={size} /> : null}
                        <path
                            className="happy-stem-cell__membrane"
                            d={frame.membrane}
                            filter={cellClayFilter(clay, false)}
                        />
                        <path
                            className="happy-stem-cell__core"
                            d={frame.core}
                            filter={cellClayFilter(clay, true)}
                        />
                    </svg>
                    {caption(index === 0 ? `Happy · ${props.shape.seed}` : label)}
                </div>
            ))}
            <span style={{ alignSelf: "center", color: "var(--text-secondary)" }}>→</span>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    paddingBottom: 2,
                }}
            >
                <HappyCell shape={reformed} size={64} />
                {caption(`Happy · ${reformed.seed}`)}
                <div style={{ height: size * 0.3 - 4 }} />
                <StemCell id={`explorer-${props.shape.seed + 1}`} size={64} />
                {caption("New")}
            </div>
        </div>
    );
}

/**
 * C-319d — Happy's design space. An endless plane of designs around a centre:
 * drag or scroll to wander, click to like. Shuffle draws a new plane; Centre
 * on selected makes the selected design the middle of the next one.
 */
function Explorer(props: { initialMode: Mode; screen: string }) {
    const [mode, setMode] = useState<Mode>(props.initialMode);
    const [space, setSpace] = useState(FIRST_SPACE);
    const [amount, setAmount] = useState(1);
    const [centre, setCentre] = useState<HappyCellShape>(HAPPY_CELL_SHAPE);
    const [pan, setPan] = useState<Cell>(HOME);
    const [selected, setSelected] = useState<Cell>([0, 0]);
    const [likes, setLikes] = useState<readonly Like[]>(likesRead);
    const drag = useRef<{ x: number; y: number; pan: Cell; moved: boolean } | null>(null);
    const plane = `${space}|${amount}|${JSON.stringify(centre)}`;
    const shapeAt = (cell: Cell) => tileShape(plane, space, centre, amount, cell);
    const likesUpdate = (next: readonly Like[]) => {
        setLikes(next);
        likesWrite(next);
    };
    const likeToggle = (cell: Cell) => {
        const existing = likes.find(
            (like) => like.plane === plane && like.cell[0] === cell[0] && like.cell[1] === cell[1],
        );
        if (existing) likesUpdate(likes.filter((like) => like !== existing));
        else
            likesUpdate([
                {
                    id: `${Date.now().toString(36)}${likes.length}`,
                    plane,
                    cell,
                    shape: shapeAt(cell),
                    at: Date.now(),
                },
                ...likes,
            ]);
    };
    const recentre = (shape: HappyCellShape) => {
        setCentre(shape);
        setPan(HOME);
        setSelected([0, 0]);
    };
    const cellAt = (event: PointerEvent<HTMLDivElement>): Cell => {
        const box = event.currentTarget.getBoundingClientRect();
        return [
            Math.floor((event.clientX - box.left + pan[0]) / TILE.width),
            Math.floor((event.clientY - box.top + pan[1]) / TILE.height),
        ];
    };

    const tiles: ReactNode[] = [];
    const [i0, j0] = [Math.floor(pan[0] / TILE.width), Math.floor(pan[1] / TILE.height)];
    for (let j = j0; j * TILE.height - pan[1] < VIEW.height; j++)
        for (let i = i0; i * TILE.width - pan[0] < VIEW.width; i++) {
            const liked = likes.some(
                (like) => like.plane === plane && like.cell[0] === i && like.cell[1] === j,
            );
            tiles.push(
                <Tile
                    at={[i * TILE.width - pan[0], j * TILE.height - pan[1]]}
                    key={`${plane}|${i},${j}`}
                    liked={liked}
                    selected={selected[0] === i && selected[1] === j}
                    shape={shapeAt([i, j])}
                />,
            );
        }
    const chosen = shapeAt(selected);

    return (
        <ThemeScope mode={mode}>
            <div
                data-screen={props.screen}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    padding: 20,
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontFamily: "var(--happy-font-ui)",
                    fontSize: 13,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                        onClick={() => setMode(mode === "light" ? "dark" : "light")}
                        style={button}
                        type="button"
                    >
                        {mode === "light" ? "Dark" : "Light"}
                    </button>
                    <button
                        onClick={() => {
                            setSpace(Math.floor(Math.random() * 1e6));
                            setPan(HOME);
                            setSelected([0, 0]);
                        }}
                        style={button}
                        type="button"
                    >
                        Shuffle space
                    </button>
                    <button onClick={() => recentre(chosen)} style={button} type="button">
                        Centre on selected
                    </button>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "var(--text-secondary)" }}>Exploration</span>
                        <input
                            max={3}
                            min={0}
                            onChange={(event) => setAmount(Number(event.currentTarget.value))}
                            step={0.05}
                            type="range"
                            value={amount}
                        />
                        <span style={{ width: 32, fontVariantNumeric: "tabular-nums" }}>
                            {amount.toFixed(2)}
                        </span>
                    </label>
                </div>
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <div
                        onPointerDown={(event) => {
                            drag.current = {
                                x: event.clientX,
                                y: event.clientY,
                                pan,
                                moved: false,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            const d = drag.current;
                            if (!d) return;
                            const [dx, dy] = [event.clientX - d.x, event.clientY - d.y];
                            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
                            if (d.moved) setPan([d.pan[0] - dx, d.pan[1] - dy]);
                        }}
                        onPointerUp={(event) => {
                            const d = drag.current;
                            drag.current = null;
                            if (!d || d.moved) return;
                            const cell = cellAt(event);
                            setSelected(cell);
                            likeToggle(cell);
                        }}
                        ref={wheelPan((dx, dy) => setPan(([x, y]) => [x + dx, y + dy]))}
                        style={{
                            position: "relative",
                            flex: "none",
                            width: VIEW.width,
                            height: VIEW.height,
                            overflow: "hidden",
                            borderRadius: 10,
                            background: "var(--groupped-background)",
                            cursor: "grab",
                            touchAction: "none",
                            userSelect: "none",
                        }}
                    >
                        {tiles}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 220 }}>
                        <span style={{ color: "var(--text-secondary)" }}>
                            Liked {likes.length ? `· ${likes.length}` : ""}
                        </span>
                        {likes.length === 0 ? (
                            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                                Click designs you like.
                            </span>
                        ) : null}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                                maxHeight: VIEW.height - 24,
                                overflowY: "auto",
                            }}
                        >
                            {likes.map((like) => (
                                <div
                                    key={like.id}
                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                >
                                    <HappyCell shape={like.shape} size={24} />
                                    <span
                                        style={{
                                            flex: 1,
                                            color: "var(--text-secondary)",
                                            fontSize: 11,
                                        }}
                                    >
                                        seed {like.shape.seed} · {like.shape.elongation.toFixed(2)}
                                    </span>
                                    <button
                                        onClick={() => recentre(like.shape)}
                                        style={{ ...button, padding: "0 6px" }}
                                        type="button"
                                    >
                                        centre
                                    </button>
                                    <button
                                        onClick={() =>
                                            likesUpdate(likes.filter((other) => other !== like))
                                        }
                                        style={{ ...button, padding: "0 6px" }}
                                        type="button"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}
                >
                    <Preview screen={`${props.screen}-preview`} shape={chosen} />
                    <DivisionStrip screen={`${props.screen}-division`} shape={chosen} />
                </div>
            </div>
        </ThemeScope>
    );
}

export function HappyCellExplorerPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Happy cell explorer"
            summary="An endless plane of designs for Happy’s mark around a centre. Every number of the shape is its own smooth, equalised noise field over the plane, so neighbours are close relatives and far-away cells mix everything. Drag or scroll to wander, click to like (kept in this browser), Shuffle space for a new plane, Centre on selected to make a design the middle. Below: the selected design in a sidebar and a chat line, and one division of it."
            width={1100}
        >
            {(["light", "dark"] as const).map((mode, index) => (
                <Specimen
                    detail="The real HappyCell at 64 and 20 px in every tile; the strip is the real division simulation"
                    key={mode}
                    label={`${mode} · explorer`}
                    number={`0${index + 1}`}
                    stage="app"
                >
                    <Explorer initialMode={mode} screen={`explorer-${mode}`} />
                </Specimen>
            ))}
        </ComponentPage>
    );
}
