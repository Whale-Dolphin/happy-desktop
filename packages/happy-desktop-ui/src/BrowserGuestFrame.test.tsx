import "./styles.css";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { BrowserGuestFrame, BrowserGuestSlot } from "./BrowserGuestFrame";
import { ConnectionSurface } from "./ConnectionSurface";
import { createRenderer } from "./testing";

it("places the native frame on its slot and keeps the exact content while hidden", async () => {
    const view = createRenderer();
    const placement: { host?: HTMLElement | null } = {};
    view.render(
        () => (
            <div style={{ display: "flex", width: 600, height: 400 }}>
                <ConnectionSurface active>
                    <BrowserGuestSlot
                        onSlot={(_slot, host) => {
                            placement.host = host;
                        }}
                    />
                </ConnectionSurface>
            </div>
        ),
        { width: 800, height: 600 },
    );
    await view.ready();
    const slot = view.container.querySelector(".happy-browser-guest-slot")!;
    const rect = slot.getBoundingClientRect();
    expect(rect.width).toBe(600);
    expect(rect.height).toBe(400);
    expect(placement.host?.dataset.happyDesktopUi).toBe("connection-surface");
    const host = document.createElement("div");
    placement.host!.append(host);
    const root = createRoot(host);
    const origin = placement.host!.getBoundingClientRect();
    const bounds = {
        x: rect.x - origin.x,
        y: rect.y - origin.y,
        width: rect.width,
        height: rect.height,
    };
    const render = (shown: boolean) =>
        flushSync(() =>
            root.render(
                <BrowserGuestFrame bounds={shown ? bounds : undefined}>
                    <input defaultValue="website draft" />
                </BrowserGuestFrame>,
            ),
        );
    try {
        render(true);
        const frame = host.firstElementChild!;
        const input = host.querySelector("input")!;
        const position = frame.getBoundingClientRect();
        expect([position.x, position.y, position.width, position.height]).toEqual([
            rect.x,
            rect.y,
            600,
            400,
        ]);
        expect(getComputedStyle(frame).display).toBe("flex");
        input.value = "keep this local draft";
        input.focus();
        input.setSelectionRange(5, 9);
        expect(document.activeElement).toBe(input);
        render(false);
        expect(getComputedStyle(frame).display).toBe("none");
        expect(host.querySelector("input")).toBe(input);
        render(true);
        expect(host.querySelector("input")).toBe(input);
        expect(input.value).toBe("keep this local draft");
        expect([input.selectionStart, input.selectionEnd]).toEqual([5, 9]);
    } finally {
        flushSync(() => root.unmount());
        host.remove();
    }
});
