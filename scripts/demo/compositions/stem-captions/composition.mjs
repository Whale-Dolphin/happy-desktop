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
        { from: 0, text: "Every new task starts as a *stem cell*" },
        { from: "picker-open", text: "Any model: Claude, Codex or Grok" },
        { from: "typing-started", text: "Just say what it is" },
        { from: "stem-named", text: "It *names itself*" },
        { from: "stem-icon", text: "grows *its own icon*" },
        { from: "stem-filed", text: "and *files itself* where it belongs" },
        { from: "first-read-visible", text: "Then it gets to work" },
        { from: "artifact-shown", text: "and *shows you* the result" },
        { from: "astra-spawned", text: "A *second model* reviews the change" },
        { from: "phone-enter#2", text: "Ship it *from your phone*" },
        { from: "ship-running", text: "It *pushes to main* and waits for CI" },
        { from: "deployed", text: "*Live.*" },
        { from: "outro", text: "*Stem cells.* One button for all new work." },
    ],
    hints: [
        { cue: "stem-named", side: "right", seconds: 2, text: "Named from your message" },
        { cue: "stem-icon", side: "right", delay: 1.7, seconds: 1.9, text: "Picked its own icon" },
        { cue: "stem-filed", side: "below", seconds: 2.2, text: "Filed under Voice" },
        {
            cue: "phone-filed",
            side: "below",
            seconds: 2.2,
            text: "Same sidebar, live on the phone",
        },
        { cue: "artifact-shown", side: "below", seconds: 2.6, text: "A live preview in the chat" },
        { cue: "astra-spawned", side: "below", seconds: 2.4, text: "GPT-6 Astra checks the logic" },
    ],
};
