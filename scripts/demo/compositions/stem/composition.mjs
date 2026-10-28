/*
 * The stem take: the recorded desktop window and its synchronized phone on the
 * README's photographic backdrop, in a squarer frame with room above the
 * window for a caption line.
 *
 * The phone parks beside the window, half the README's gap away, fully in the
 * frame. During the take's phone-focus cues it grows by 1.1 from its left
 * edge, away from the window, so it never covers the composer.
 *
 * Geometry is in output pixels. The desktop's corner radius is 14 recorded
 * CSS pixels of its 668-pixel-wide app, like the website's window.
 */
export default {
    id: "stem",
    title: "Stem: desktop with the paired phone",
    output: { width: 1664, height: 1080, fps: 60 },
    backdrop: { source: "../readme/backdrop.jpg", blur: 1.2 },
    desktop: { x: 150, y: 150, width: 885, height: 880, cssWidth: 668, cssRadius: 14 },
    phone: {
        frame: "../../demos/core/assets/device/iphone-16-pro-black.png",
        alpha: "../../demos/core/assets/device/screen-alpha.png",
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
        width: 386,
        left: 1087,
        bottom: 1046,
        focusScale: 1.1,
        clearOfDesktop: true,
        transition: { seconds: 0.85, easing: [0.22, 0.8, 0.24, 1] },
    },
    poster: { seconds: 22 },
    encode: { crf: 18, preset: "veryslow", audioBitrate: "96k", maximumBytes: 12_000_000 },
};
