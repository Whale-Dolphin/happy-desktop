import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles.css";
import "./variants.css";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Sidebar } from "../../src/Sidebar";
import { ThemeScope } from "../../src/ThemeScope";
import { variantItems } from "./rows";
import {
    KNOBS,
    variantRead,
    variantSubscribe,
    variantWrite,
    type KnobName,
    type Variant,
} from "./variant";

const LABELS: Record<KnobName, string> = {
    lines: "Lines",
    hover: "Hover",
    hairlines: "Hairlines",
    icon: "Icon",
    dot: "Dot",
    align: "Text block",
    theme: "Theme",
};

const VALUE_LABELS: Record<string, string> = {
    "3": "3 lines",
    "2": "2 lines",
    none: "None",
    highlight: "Highlight",
    hide: "Hide lines",
    full: "Full",
    inset: "Inset",
    bare: "Bare",
    disc: "Disc",
    neutral: "Grey",
    state: "State",
    telegram: "Telegram",
    baseline: "Baseline",
    light: "Light",
    dark: "Dark",
};

function Panel(props: { variant: Variant }) {
    return (
        <div className="sv-panel" data-sv="panel">
            {(Object.keys(KNOBS) as KnobName[]).map((name) => (
                <div className="sv-panel__knob" key={name}>
                    <span className="sv-panel__label">{LABELS[name]}</span>
                    <SegmentedControl
                        aria-label={LABELS[name]}
                        fullWidth
                        onChange={(value) => variantWrite({ ...props.variant, [name]: value })}
                        segments={KNOBS[name].map((value) => ({
                            value,
                            label: VALUE_LABELS[value] ?? value,
                        }))}
                        size="compact"
                        value={props.variant[name]}
                    />
                </div>
            ))}
        </div>
    );
}

function Page() {
    const variant = useSyncExternalStore(variantSubscribe, variantRead);
    const items = variantItems({
        lines: variant.lines === "2" ? 2 : 3,
        dot: variant.dot,
    });
    return (
        <ThemeScope mode={variant.theme}>
            <div className="sv-stage" data-sv="stage">
                <Sidebar
                    activeItemId={variant.sel}
                    className="sv-sidebar"
                    data-sv-align={variant.align}
                    data-sv-dot={variant.dot}
                    data-sv-hairlines={variant.hairlines}
                    data-sv-hover={variant.hover}
                    data-sv-icon={variant.icon}
                    data-sv-lines={variant.lines}
                    itemFoldControls={false}
                    onItemSelect={(id) => variantWrite({ ...variant, sel: id })}
                    sections={[{ id: "work", items }]}
                />
                {variant.panel === "1" ? <Panel variant={variant} /> : null}
            </div>
        </ThemeScope>
    );
}

createRoot(document.getElementById("root")!).render(<Page />);
