/*
 * The stem take with its story told on screen: one caption line in the band
 * above the window, and short hints that point at what just happened — the
 * row naming itself, its icon, where it filed itself, the phone keeping up.
 * The geometry is the stem composition's; every hint points at a rectangle
 * the take recorded with its cue.
 */
import stem from "../stem/composition.mjs";

export default {
    ...stem,
    id: "stem-captions",
    title: "Stem: desktop with the paired phone, captioned",
    backdrop: { ...stem.backdrop, source: "../readme/backdrop.jpg" },
    captionBand: { centerY: 80 },
    captions: [
        { from: 0, text: "Any model: Claude, Codex, Grok, Gemini, and more" },
        { from: "picker-chosen", text: "All new work starts with a *stem cell*" },
        { from: "typing-started", text: "Just say what you want done" },
        { from: "stem-named", text: "It *names itself*" },
        { from: "stem-icon", text: "grows *its own icon*" },
        { from: "stem-filed", text: "*Sidebar self-organizes*" },
        { from: "first-read-visible", text: "Then it gets to work" },
        { from: "artifact-shown", text: "and *shows you* a live preview" },
        { from: "astra-spawned", text: "*GPT-6 Astra* reviews the change" },
        { from: "phone-enter#2", text: "Ship it *from your phone*" },
        { from: "ship-running", text: "It *pushes to main* and waits for CI" },
        { from: "deployed", text: "*Live.*" },
        { from: "outro", text: "*Stem cells.* One button for all new work." },
    ],
    hints: [
        { cue: "stem-named", side: "right", seconds: 2, text: "Named from your message" },
        // After the 2.5 s growth into the icon.
        { cue: "stem-icon", side: "right", delay: 2.4, seconds: 1.3, text: "Picked its own icon" },
        { cue: "stem-filed", side: "below", seconds: 2.2, text: "Filed under Voice" },
        // Gone before the phone steps back at phone-exit, 2 s later.
        {
            cue: "phone-filed",
            side: "below",
            seconds: 1.7,
            text: "Same sidebar, live on the phone",
        },
        // Rings only: a label would cover the chat, and the caption says it.
        { cue: "artifact-shown", seconds: 2.6 },
        { cue: "astra-spawned", seconds: 2.4 },
    ],
};
