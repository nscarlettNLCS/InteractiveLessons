# Computer Science interactive lessons

Lessons you present from the front of the room, with students answering live on their own devices. Hosted free on GitHub Pages, with a free Firebase project handling the live answers.

## What's here

```
index.html                  the home page listing your lessons
vote.html                   the ONE page students use, for every lesson
firebase-config.js          your Firebase settings (set up once)
database.rules.json         security rules to paste into Firebase
shared/lesson.css           how every lesson looks
shared/lesson.js            the engine: questions, results, editor, Parsons,
                            fill the gaps, annotation, timer, Present mode
y9/python-functions.html    a lesson: content only
```

A new lesson is one file in a year-group folder. Fixes or new features in `shared/` reach every lesson at once.

---

## Moving your current GitHub repository across

You already have `index.html`, `vote.html`, `firebase-config.js` at the top level. To switch to this layout:

1. **Keep your own `firebase-config.js`.** Don't upload the one in this folder — it has blank `PASTE` values.
2. Upload the new `index.html` and `vote.html` (they replace the old ones), plus the `shared` and `y9` folders. On GitHub, **Add file → Upload files**, then drag the whole `shared` and `y9` folders in. GitHub keeps the folder structure.
3. Paste the updated `database.rules.json` into **Firebase → Realtime Database → Rules → Publish**. The only change allows typed answers.
4. Your lesson now lives at `https://YOUR-USERNAME.github.io/REPO/y9/python-functions.html`, and the home page lists it.

First time setting up Firebase? The steps are at the bottom of this file.

---

## Running a lesson

- **Live answers → Start a live session**, then show the room code and QR code. Students go to `vote.html`, which is the same link for every lesson.
- Each question has **Open on devices**. Only one is open at a time.
- **Nobody sees the tallies until you press Reveal.** Students see "answer sent", and you see how many are in. This stops students copying the majority.
  - **Peek** shows you the split without revealing it to the class. Remember it appears on the projector.
  - **Reveal answer** (or **Show answers** for typed questions) shows the bars, marks each student right or wrong on their own device, and updates their score.
- **Typed questions:** students type a short answer. Identical answers are grouped with a count, and each answer is marked against the accepted answers you set. Spacing and capitals are ignored, and for code answers all spaces are ignored. Press ✕ on any answer to delete it if a student types something silly.
- **Check-ins** ("All correct / Partly done / Stuck") after the practical tasks tell you who needs help.
- **Hand counts:** tap the options to count raised hands for students without a device. These are added to the totals.
- **Results** (top bar, or the bottom bar in Present mode) shows the % correct for each question and the average for the lesson. **Copy summary** copies it for your records.
- **Present mode** (⛶ or **P**) hides the menus and goes full screen. Arrow keys or a clicker move between stages, and **Esc** exits.
- **End session** deletes that lesson's answers from Firebase.

## Asking for a new lesson

Ask Claude for a lesson on a topic and it builds one content file in the same style, using the shared engine, with:
- stages built around PRIMM (Predict, Run, Investigate, Modify, Make)
- Support, Core and Stretch versions of every activity
- a Parsons problem, fill the gaps, annotation matching and code the class can run
- class votes, typed questions and check-ins through the lesson
- Korean key words and short, visual instructions
- teacher notes on every stage.

You then upload the one file to your year-group folder and add a card to `index.html`.

---

## First-time Firebase setup (about 10 minutes)

1. **GitHub Pages:** create a repository, upload these files, then **Settings → Pages → Deploy from a branch → main → / (root)**.
2. **Firebase project:** at <https://console.firebase.google.com> create a project. Open **Authentication** (if you can't find it in the menu, put `/authentication` at the end of the address), click **Get started**, then **Sign-in method → Anonymous → Enable → Save**.
3. **Database:** open **Realtime Database** (or end the address with `/database`) → **Create Database** → location **Singapore (asia-southeast1)** → **Start in locked mode**. Then **Rules**, paste in `database.rules.json`, and **Publish**.
4. **Connect it:** ⚙️ **Project settings → Your apps → `</>`**, register a web app, and copy the values from `const firebaseConfig = { … }` into `firebase-config.js` on GitHub, keeping the first line as `window.FIREBASE_CONFIG = {`. Make sure there's a `databaseURL` line; if not, copy the address at the top of the Realtime Database page.
5. **Test:** open a lesson, start a session, join on your phone and answer one question.

These settings are safe to publish. Firebase web settings are meant to be public, and the rules protect the data.

## Good to know

- **Free plan:** 100 devices connected at once, which is plenty for a class. Several teachers can share one project, but not 100+ students at the same moment.
- **Privacy:** no names, emails or student work are stored. Each device gets a random anonymous ID, and answers are deleted when you end the session.
- **School network:** the pages use `gstatic.com` (Firebase), `cdn.jsdelivr.net` (the Python runner), `cdnjs.cloudflare.com` (QR codes) and `fonts.googleapis.com`. If something doesn't load on school Wi-Fi, ask IT to allow these plus `*.firebasedatabase.app`.
- **Old rooms:** if you close the tab without ending the session, the room stays in the database. Delete old ones occasionally in **Realtime Database → Data**.

## Troubleshooting

| What you see | What to do |
|---|---|
| No **Live answers** button | The Firebase scripts were blocked by the network. Hand counting still works. |
| "Live answering isn't set up on this copy" | `firebase-config.js` still has `PASTE` values, or no `databaseURL`. |
| "… admin-restricted-operation" | Anonymous sign-in isn't switched on. |
| "… PERMISSION_DENIED" | The rules weren't published, or the typed-answer rule update is missing. |
| Students see "Room not found" | Check the code. Codes never use I, L, O, 0 or 1. |
| Typed answers won't send | Publish the updated `database.rules.json` (it allows text answers). |
