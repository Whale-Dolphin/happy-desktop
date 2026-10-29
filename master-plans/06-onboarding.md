# First-run onboarding

## Where we are going

Onboarding happens inside the app, in Happy's chat. This is not onboarding, this
is the real thing: the app looks exactly the way it will in daily use. There is
no separate setup wizard, no step bar, and no painted backdrop. Happy (formerly
Chief of Staff) is your main agent: you meet it first, and afterwards it is
where you go when anything errors or needs reconfiguring, including Happy
itself.

The sidebar is the real stem-cell sidebar from the first second. Search, New and
Happy are real. Below Happy is the pinned separator. Everything below that
separator is one example of a working sidebar, marked **Example** with a dashed
yellow outline. There are no Projects, there is one search, and the sidebar
carries no brand text. Rows use clay icons from the real icon set.

Until an assistant is connected, Happy's messages are preloaded and need no
model. Once an assistant is connected, onboarding continues fully driven by the
model: Happy writes the rest of the conversation and its inline actions itself.

Each new step is a new message from Happy, with Happy's author line and mark, so
one step is clearly separate from the next.

Inline buttons are outlined. At most one action in a message is emphasized, and
only when it is truly primary. Choosing an option never sends a chat message.
The action that actually starts work, such as **Install and sign in**, is laid
out as if the person had sent it as a message: it moves up the way a sent
message does, and the work follows below it, roughly in the middle of the
screen. Every existing chat scroll rule applies. Green checks mark what is
done: an install, a sign-in, a connected provider.

The composer stays disabled until an assistant is connected.

## Inline actions in chat

Agents render inline UI the same way they lay out images: a small, safe subset
of HTML with no scripts. The subset adds buttons, a checkbox list or table with
a submit, a step list (pending, running, done, failed), and a status row. Every
action carries an explicit action id and typed parameters that the app routes
to a handler. Nothing about an action is inferred from its text.

## The flow

1. **Choose a subscription.** "Which AI do you already pay for?" Claude,
   ChatGPT, Grok, Gemini (Antigravity), None yet, or an API key or something
   else. None yet is not a dead end. Sign-ins that already exist on the computer
   are shown as signed in, as a checklist with every detected one checked.
2. **Connect.** If the assistant's CLI is missing, Happy says what it will
   download, from which official site, and shows the exact command before
   doing it. It then installs the CLI and opens the vendor's sign-in. No
   terminal is needed on macOS or Windows. Happy offers to let the person do it
   themselves, and says how to use the CLI directly.
3. **Connect more.** After the first sign-in, Happy still offers more: it lists
   the providers you can add, with the ones already connected at the far right,
   each with a green check. If you have more than one account, you can add those
   too. You can always ask Happy later.
4. **Profile.** Name and email, prefilled where possible: **That's me**.
5. **Your work.** This is about the work you have been doing, not about folders.
   Happy says exactly what it will look at, which depends on the assistant you
   signed in with, and shows those places with the folder-structure preview:
   this is where we will look. The primary action is **Discover what I've been
   working on**.
6. **Priorities.** Happy uses the Focus sub-agent to organize your existing work
   and beyond, and to help you prioritize. It proposes the final state: the real
   sidebar layout, and each piece of work with its final name, icon and topic,
   as a table with **Looks right** and **Adjust**. The table stays light; the last
   column carries little text. Topics are specific, never something generic like
   "Happy app". Focus organizes or places work; it does not "file" it.
7. **Keep going.** The accepted work is already started. The natural next step
   is to make something new with **New**, which opens a stem cell.
8. **Phone.** Happy shows a preview of the phone app and the QR codes to scan
   right away. The primary action is **I've downloaded and opened Happy**; the
   other is **Later**.

Afterwards, every error card's way out is **Ask Happy**, and Happy answers with
inline actions, such as signing in again.

## One download

The first-install download carries Happy Agent, so first run needs no second
download. Desktop updates do not carry it: the app and Happy Agent update
separately. On macOS, double-clicking the downloaded app installs it into
Applications and relaunches it from there; nobody drags anything.

## For later

- **Phone app preview.** The phone step shows only the QR codes for now. Add a
  preview of the phone app beside them once there is a screenshot that looks
  right.

## How we know it is done

- A fresh macOS or Windows machine with no CLIs gets from download to a signed
  in Happy without opening a terminal, and is told what was downloaded and
  from where before it happens.
- The first screen is the real app with the stem-cell sidebar. Everything below
  Happy's separator is one dashed-yellow example; there is no wizard, step bar,
  or backdrop.
- Each step is its own message from Happy and follows every chat scroll rule.
  The action that starts work moves up like a sent message.
- The composer is disabled until an assistant is connected, and from then on
  Happy, not a script, drives the conversation.
- Existing sign-ins show as signed in, and Happy offers more providers and
  accounts after the first one.
- Happy discloses where it will look before it looks at your work.
- Proposed work shows its final name, icon and topic before you accept it.
- The app is called Happy wherever it said Chief of Staff, and error cards
  offer Ask Happy.
- The first-install download installs both the app and Happy Agent, desktop
  updates do not carry Happy Agent, and macOS needs no drag to Applications.
