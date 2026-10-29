import "./styles.css";
import { expect, it } from "vitest";
import { assertParallelRoundedCorners, createRenderer } from "./testing";

it("enforces parallel nested curves and symmetric insets for every rendered happy-desktop-ui part", async () => {
    const view = createRenderer().render(
        () => (
            <div
                data-happy-desktop-ui="parallel-corner-outer"
                style={{
                    height: "100px",
                    position: "relative",
                    borderRadius: "14px",
                    width: "100px",
                }}
            >
                <div
                    data-happy-desktop-ui="parallel-corner-inner"
                    style={{
                        position: "absolute",
                        inset: "4px",
                        borderRadius: "10px",
                    }}
                />
            </div>
        ),
        { height: 100, width: 100 },
    );
    await view.ready();

    const inner = view.$('[data-happy-desktop-ui="parallel-corner-inner"]').element as HTMLElement;
    inner.style.borderRadius = "9px";
    expect(() => assertParallelRoundedCorners(view.container)).toThrowError(
        /inner radius 9\.000px × 9\.000px.*expected 10\.000px × 10\.000px/,
    );

    inner.style.borderRadius = "10px";
    inner.style.top = "5px";
    expect(() => assertParallelRoundedCorners(view.container)).toThrowError(
        /horizontal inset 4\.000px and vertical inset 5\.000px must match/,
    );
});

it("exempts a full circle inside a corner field, but not a rounded rectangle just short of one", async () => {
    const view = createRenderer().render(
        () => (
            <div
                data-happy-desktop-ui="circle-corner-outer"
                style={{
                    height: "64px",
                    position: "relative",
                    borderRadius: "14px",
                    width: "200px",
                }}
            >
                <div
                    data-happy-desktop-ui="circle-corner-inner"
                    style={{
                        position: "absolute",
                        top: "7px",
                        left: "7px",
                        width: "50px",
                        height: "50px",
                        borderRadius: "999px",
                    }}
                />
            </div>
        ),
        { height: 64, width: 200 },
    );
    // A 50px disc 7px into a 14px corner is a circle, not a parallel curve.
    await view.ready();

    // The same box rounded to just under half its side is a rounded rectangle,
    // and must still be a parallel curve.
    const inner = view.$('[data-happy-desktop-ui="circle-corner-inner"]').element as HTMLElement;
    inner.style.borderRadius = "24px";
    expect(() => assertParallelRoundedCorners(view.container)).toThrowError(
        /inner radius 24\.000px × 24\.000px.*expected 7\.000px × 7\.000px/,
    );
});
