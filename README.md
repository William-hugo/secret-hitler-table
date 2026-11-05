# Secret Hitler — TV + phones edition

Play Secret Hitler with the board on your TV and everyone's secret cards on their own phone. You need 5–10 players and one computer running this app.

## One-time setup

1. Install **Node.js** (the "LTS" version) from https://nodejs.org. Use the default options.
2. Unzip this folder somewhere easy to find, like your Desktop.

## Starting a game night

1. **Start the app** on the computer:
   - **Windows:** double-click `start-windows.bat`. If Windows Firewall asks, click **Allow** (private networks).
   - **Mac:** double-click `start-mac.command`. If macOS blocks it, right-click it → Open → Open.
   - **Any computer:** open a terminal in this folder and run `npm start`.
2. The window prints an address like `http://192.168.1.23:3000/tv`. Open it on the TV:
   - laptop plugged into the TV with HDMI (easiest), or
   - the TV's web browser, or
   - a Chromecast / Fire Stick browser.
   Click **Full screen** in the bottom corner.
3. Everyone scans the QR code on the TV with their phone camera, then types their name.
   **Phones must be on the same Wi-Fi as the computer.**
4. The first person to join is the **host**. On their phone they can move players up/down so the order matches where people are sitting (clockwise), then tap **Start game**.

Leave the computer running and don't let it go to sleep during the game.

## Playing when people aren't on the same Wi-Fi

### Option A — online link from your laptop (easiest, no accounts)
Double-click **`start-online.bat`** (Mac: `start-online-mac.command`) instead of the normal start file.
- The first time, it downloads Cloudflare's free tunnel tool (`cloudflared`) into this folder.
- After about 10 seconds it prints an `https://…trycloudflare.com/tv` address. Open that on the TV.
- Anyone can join from anywhere: public Wi-Fi, a different network, or mobile data. No firewall settings are needed.
- The link is new every time you start it (the QR code on the TV always has the right one).
- Your laptop has to stay on with this window open.

### Option B — a permanent website (no laptop needed)
Put the game on Render's free hosting and you get a fixed link like `https://your-game.onrender.com`. Then open `/tv` on any TV or laptop browser, and players scan the QR code.
1. Put this folder in a GitHub repository. Leave out `node_modules` and `cloudflared.exe`; the included `.gitignore` already skips them.
2. Make a free account at https://render.com and sign in with GitHub.
3. Click **New → Blueprint**, pick your repository, and confirm. The included `render.yaml` sets everything up on the free plan.
4. When it says "Live", open `https://<your-service>.onrender.com/tv` on the TV.

Free Render services go to sleep after 15 minutes with nobody connected. The first visit after that takes about a minute to wake up (you'll see a loading page). Open the TV page a minute before people arrive. While a game is going it stays awake. If the service restarts, any game in progress is lost.

## How the app plays

| Step | TV (everyone sees) | Phones (private) |
|---|---|---|
| Roles | "Look at your phone" + who's ready | Hold the button to see your role. Fascists see their team. Hitler only sees the Fascists in 5–6 player games. |
| Nomination | Who is the Presidential Candidate | The President's phone lists only eligible Chancellors |
| Vote | Who has voted (not how) | Ja! / Nein. You can change your vote until the last one comes in |
| Vote result | Every ballot flips over at once | — |
| Legislative session | "No talking!" | President picks 1 of 3 to discard → Chancellor picks 1 of 2 to enact |
| Policy enacted | The card drops onto the board | — |
| Presidential power | Which power is being used | Only the President sees the investigation result or the policy peek |
| Game over | Winner + every player's role | Win/lose screen |

Nobody can sneak a look at hidden info: the phones only receive what that player is allowed to know.

## Rules the app enforces (official rules)

- **Roles:** 5p = 3 Liberals, 1 Fascist + Hitler · 6p = 4/1 · 7p = 4/2 · 8p = 5/2 · 9p = 5/3 · 10p = 6/3. Deck is 6 Liberal + 11 Fascist policies.
- **Presidency** passes clockwise (seat order) every round, including after a failed election.
- **Term limits:** the last *elected* President and Chancellor can't be nominated Chancellor. When only 5 players are left alive, only the last Chancellor is term-limited. Anyone can be President.
- **Vote:** a majority of Ja wins; a tie fails. Dead players don't vote.
- **Failed government:** the presidency moves to the next player and the election tracker goes up by 1.
- **Chaos:** after 3 failed governments in a row, the top policy is enacted automatically, its power is ignored, the tracker resets, and term limits are forgotten.
- **Hitler as Chancellor:** once 3 Fascist policies are on the board, electing Hitler as Chancellor wins the game for the Fascists. If anyone else gets elected, the TV marks them "Not H" (confirmed not Hitler).
- **Deck:** when fewer than 3 policies are left, the discard pile is shuffled back in.
- **Powers** (Fascist track):
  - 5–6 players: 3rd = Policy peek, 4th & 5th = Execution
  - 7–8 players: 2nd = Investigate, 3rd = Special election, 4th & 5th = Execution
  - 9–10 players: 1st & 2nd = Investigate, 3rd = Special election, 4th & 5th = Execution
- **Investigate** shows party membership only (Hitler shows as Fascist). Nobody can be investigated twice.
- **Special election:** the President picks anyone as the next President. After that, the order goes back to the player to the left of the President who called it.
- **Execution:** if Hitler is executed, Liberals win. Otherwise the dead player's role stays secret.
- **Veto:** after 5 Fascist policies, the Chancellor can propose a veto. If the President agrees, both policies are discarded and the tracker goes up by 1. If the President refuses, the Chancellor must enact one.
- **Wins:** Liberals: 5 Liberal policies or Hitler executed. Fascists: 6 Fascist policies or Hitler elected Chancellor after 3 Fascist policies.

Talking, accusing and lying all happen out loud at the table, like the real game.

## Extras

- **Narrator** (TV corner button): reads each announcement aloud. Turn it on after the TV page loads.
- Sound effects play on the TV for vote reveals, policies and the ending.
- If a phone locks or refreshes, the player is put back in their seat automatically.
- The host can end a game early, play again with the same seats, or go back to the lobby.

## Night phase and narration

After everyone has looked at their role, the TV plays the official narration for your player count
(the "everybody close your eyes" setup ritual). The takes are picked at random each game, like the official app.
- Click the TV page once before the game so the browser allows sound.
- The host can skip the narration from their phone, and the TV has a Skip button.
- **Classic night phase** (host's lobby setting): phones don't show the Fascist team, so players find each other with eyes closed, exactly like the board game.

## Artwork and sounds

The boards, cards, ballots and envelope come from Secret Hitler Online (see CREDITS.md) in `public/assets/`.
To swap an image, replace the file with one of the same name. Narration files are in `public/narration/`.

## Settings

- Different port: set `PORT=4000` before starting.
- Slower/faster reveal screens (milliseconds): `T_VOTE=9000 T_ENACT=7500 T_EXEC=7000`.
- `npm test` runs the rules tests and 4,000 simulated games (needs `npm install` first).

## Credits and license

See CREDITS.md for the artwork and narration sources.


Fan-made adaptation of *Secret Hitler* by Max Temkin, Mike Boxleiter, Tommy Maranges and Mac Schubert, used under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 license (https://creativecommons.org/licenses/by-nc-sa/4.0/). This version is free and must stay non-commercial — don't sell it or charge to play. The artwork in this folder is original and isn't the official game art.
