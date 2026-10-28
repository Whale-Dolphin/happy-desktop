# Stem demo: new work starts as a stem cell

This is the core demo's story, but it opens on a stem cell. Use today's UI with
Settings → Experimental → Spaces sidebar and Stem cells turned on. Framing,
resolution, backdrop, traffic lights and phone treatment match core v21-r2.
Everything on screen is real product behavior. Fixtures are disclosed in
`stem.evidence.json`.

## Recording

```sh
HAPPY_DESKTOP_AGENT_EXECUTABLE=~/.happy/dist/version/0.4.109/happy-agent \
  pnpm demo record stem --out scripts/demo/demos/stem/artifacts/<take> \
  --phone-udid <udid> --phone-direct
pnpm demo compose readme --desktop <take>/stem.mp4 \
  --phone <take>/phone-screen.mp4 --cues <take>/cues.json --out <take>/composed
```

- `--phone-direct` means the phone is the native Happy iOS app
  (`packages/happy-ios`, bundle `com.slopus.happy.dev`). It is paired to the
  demo daemon through the daemon's own direct mobile connector. The gym runs
  that connector on port 24963.
- Pair once, off camera, against the demo world in `.d`:
    1. Start the pairing with `startMobilePairing` and open its QR URL on the
       Simulator with `simctl openurl`.
    2. On the phone, turn on direct connection and use Emoji match.
    3. On the desktop side, call `confirmMobilePairing(id)`.
- The pairing is stored in `.d`, so `pnpm demo reset` removes it and you have
  to pair again.
- Recording needs execution outside the sandbox (Chromium, simctl, Maestro).

## Beats and cues (take `v23-stem-r2`, 60fps, 3,869 frames, 64.48s)

| s             | cue                           | what is on screen                                                                                                                                    |
| ------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0             | —                             | An already-opened stem cell: the New row is selected and its composer is empty, on GPT-6 Astra. The parked phone shows the same New row under Happy. |
| 3.37          | picker-open                   | The model menu shows Claude, Codex and Grok side by side. GPT-6 Sol is absent.                                                                       |
| 9.27          | picker-chosen                 | Hover passes Astra → Grok 4.7 → Opus 5.5, then Fable 5.1 is chosen.                                                                                  |
| 15.33         | phone-enter                   | The phone comes forward as the prompt finishes.                                                                                                      |
| 16.10         | work-started                  | The message is sent.                                                                                                                                 |
| 17.33 / 17.45 | stem-named / phone-named      | The row names itself "Voice waveform", on both screens.                                                                                              |
| 19.67 / 19.77 | stem-icon / phone-icon        | The stem cell grows its sparkle icon, on both screens.                                                                                               |
| 21.72 / 21.83 | stem-filed / phone-filed      | Focus files the row under Voice, on both screens.                                                                                                    |
| 23.80         | phone-exit                    | The phone returns to its parked position.                                                                                                            |
| 24.67–35.85   | first-read … response-settled | The agent reads, edits `waveformActive.ts` (+3 −1), spawns Astra and replies.                                                                        |
| 39.35         | phone-enter                   | Steve's phone.                                                                                                                                       |
| 41.33         | phone-session-open            | Steve taps the Voice waveform row in the phone's sidebar and reads the reply.                                                                        |
| 45.32 / 47.77 | phone-typing / phone-sent     | Steve types "ship it" on the real iOS keyboard and sends it.                                                                                         |
| 49.02         | phone-exit                    | The phone goes back to its sidebar.                                                                                                                  |
| 49.03–59.33   | steve-message … deployed      | Steve's message lands, then the greeting, the Bash ship, Astra finishing (52.05) and Deployed.                                                       |
| 64.48         | end                           |                                                                                                                                                      |

Each phone cue waits until the phone's own accessibility tree shows the change.
The sidebar updates arrive by live sync. The phone lags the desktop by about
0.1s.

## Verification the take enforces

- The starting model is Astra and there is no GPT-6 Sol row in the picker.
- The row's title, library icon and filing are read from the daemon (title and
  icon from `listSpaces`, filing from `getSpaceSidebar`).
- The phone opens on this take's own New row right under Happy, with every
  seeded row under its section. Its new-work composer is on Fable 5.1.
- The phone then shows the renamed row, its `clay-new-feature` icon and the
  row under Voice, each from a fresh inspect.
- The workspace has exactly one changed file before Astra launches.
- On the phone, the transcript shows the completed reply. The native keyboard
  is present. The composer's value is exactly `ship it` before Send.
- Steve's message is in Auto. Astra is idle before Deployed. There is no
  "Working in subagents" status at the end.
- `shippingVerify` confirms the fixture checkout was restored.

## Fixtures (disclosed in evidence)

- **Checkout.** Repository finding is on the roadmap, so off camera the stem
  cell's empty task folder gets a Git clone of the fixture happy repository.
- **Earlier work.** The section headings are the person's own sidebar edit.
  The earlier rows are stem cells filed by Focus's real tools. The screenplay
  chooses titles, icons and sections.
- **Picker.** The picker lists only today's models: the gym's per-provider
  `include_models`, plus a demo patch that hides the gym's own provider.
- **Steve.** A fictional identity attached at the protocol proxy. Git, CI and
  the deploy are offline screenplay fixtures.

## Native iOS app compared with the v21 phone beat

- **No tool activity or diff in the transcript.** The iOS chat shows the
  messages, a "Working in subagents" row and the Astra subagent row. It shows
  no Explore/Edit calls and no syntax-highlighted diff, so Steve reads the
  reply instead of the diff.
- **No unread or working marker.** The finished row on the phone looks exactly
  like the rows next to it, in `phone-home.png` and in accessibility. v21 said
  "new results" here. The desktop does show an unread dot, but only on Happy,
  for Focus's own subtask.
- **Picker differences.** The phone's model picker lists "Codex account: Gym",
  with only a "Gym" model under Codex. The home composer started on "Gym · Off"
  until Fable was chosen off camera.
- **Two phone focus windows.** This take focuses the phone twice.
  `lib/composition.mjs` now pairs repeated phone-enter/phone-exit cues; it used
  to read only the first pair. I have not checked whether the website's player
  handles more than one window.
