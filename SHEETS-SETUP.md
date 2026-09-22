# Google sign-in and saving results to Google Sheets

This setup is done once and costs nothing. There are three parts:

1. Turn on Google sign-in in Firebase (5 minutes)
2. Ask IT to allow the sign-in for students (a short email)
3. Set up the Google Sheets script (10 minutes)

Parts 1 and 3 are independent. Saving to Sheets works without sign-in, but students then appear as "Anonymous 1, 2, 3…" and the Progress tab can't follow them from lesson to lesson.

---

## 1. Turn on Google sign-in in Firebase

1. Open https://console.firebase.google.com/project/_/authentication/providers and choose your project.
2. Press **Add new provider**, then **Google**.
3. Switch **Enable** on, choose your email as the support email, and press **Save**.
4. Open https://console.firebase.google.com/project/_/authentication/settings and choose **Authorized domains**.
5. Press **Add domain** and enter `nscarlettnlcs.github.io`, then press **Add**.
6. Open the **Realtime Database → Rules** tab, paste in the whole of `database.rules.json` from the zip, and press **Publish**.

## 2. Ask IT to allow the sign-in

Google Workspace for Education blocks students under 18 from signing into apps the school hasn't approved. Without IT's approval, students will see "Access blocked".

First, find the app's Client ID:

1. Open https://console.cloud.google.com/apis/credentials and choose your Firebase project at the top.
2. Under **OAuth 2.0 Client IDs**, copy the Client ID of **Web client (auto created by Google Service)**. It ends in `.apps.googleusercontent.com`.

Then email IT something like this:

> Hi, I use interactive lesson pages in Computer Science (hosted at nscarlettnlcs.github.io/InteractiveLessons). Students sign in with their school Google account so their answers are saved with their names. It only asks for their name and email address.
>
> Could you please mark this app as **Trusted** for student accounts?
> Admin console → Security → Access and data control → API controls → Manage Third-Party App Access → Add app → OAuth App Name Or Client ID → paste:
> `PASTE-THE-CLIENT-ID-HERE`
>
> The results are stored in my school Google Drive. Thank you!

## 3. Set up the Google Sheets script

1. Sign in with your **school** Google account and go to https://script.google.com.
2. Press **New project**. Name it **CS Lesson Results** (click "Untitled project" at the top).
3. Delete the code in the editor. Paste in the whole of `sheets/Code.gs` from the zip, then press **Save** (the disk icon).
4. Press **Deploy → New deployment**.
5. Press the cog next to "Select type" and choose **Web app**. Then:
   - Description: `Lesson results`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Press **Deploy**, then **Authorize access**, and choose your school account.
   - If you see "Google hasn't verified this app", press **Advanced**, then **Go to CS Lesson Results (unsafe)**. It's your own script, so this is fine.
   - Press **Allow**. The script can then create Sheets and folders in your Drive.
7. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/…/exec`.
8. Open any lesson and press **Live answers**. Open **Set up saving to Google Sheets**, paste the link, then press **Save link** and **Test**. You should see "✓ Connected".

The link is saved on that computer only. On a different computer, paste it once more. Keep it to yourself, because anyone with the link could add tabs to your results.

If "Anyone" isn't offered in step 5 (only "Anyone within NLCS Jeju"), the school has turned it off. Ask IT, or use **Download CSV** in the Live panel instead. The CSV opens in Google Sheets with File → Import.

---

## How it works in a lesson

1. Press **Live answers**, pick the year and class (for example Year 9 → **9C**), and tick **Students sign in** if you want names.
2. Press **Start**. Students go to `nscarlettnlcs.github.io/InteractiveLessons/vote.html` and type the code. On a laptop they're taken into the lesson and asked to sign in once.
3. When you press **End session**, the results are saved automatically. You can also press **Save to Google Sheet** at any time. Saving again updates the same tab, so you won't get duplicates.

In your Drive:

```
CS Lesson Results/
  Year 7/   7A results, 7B results, …
  Year 9/   9C results
              ├ Progress                  one row per student, one column per lesson (% score), average in column C
              ├ 22 Sep · Python While Loops
              └ 19 Sep · Python For Loops
  Year 12 IB/   12IB results
```

Each session tab has one row per student and one column per question they answered.
- Marked answers show ✓ (green) or ✗ (red), and the options are in the note on each column heading.
- The **Class** row has the percentage correct for each question.
- Activities finished on a laptop (Parsons problem, fill the gaps and so on) show ✓.
- Students' code is listed underneath the table.

Students who answer on a phone appear as "Anonymous" and aren't added to Progress. Sign-in happens on laptops only.

You never need to update the script when the lessons change. The lesson page prepares the table and the script just writes it.
