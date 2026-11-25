# Connecting Firebase

The website and admin portal run on Firebase's free Spark plan. No card is needed.

## What Firebase stores

| Collection | What's in it |
| --- | --- |
| `site` | Page text Bonnie has changed (`content`) and the message of the day (`motd`) |
| `posts` | Blog posts and updates |
| `media`, `mediaFull` | Photos for posts, stored as compressed images (small and full size) |
| `messages` | Contact form messages |
| `admins` | Who may use the admin portal, one document per person, named by their user ID |

Photos are kept in the database instead of Firebase Storage, because Storage now requires a paid plan.

## Steps

1. **Website settings.** Paste the `firebaseConfig` block into `js/firebase-config.js`, replacing `null`. This isn't a secret; Firebase web settings are meant to be public.
2. **Security rules.** Firebase console → Firestore Database → **Rules**. Replace everything with the contents of `firestore.rules` and tap **Publish**.
3. **Make Bonnie an admin.** Firestore Database → **Data** → **Start collection**:
   - Collection ID: `admins`
   - Document ID: Bonnie's **User UID** (Authentication → Users)
   - Add a field: `email`, type string, value her email address
   - Save. Repeat for anyone else who should have access.
4. **Allowed websites.** Authentication → Settings → **Authorized domains**: make sure `lawyerloomis.com` and `USERNAME.github.io` are listed.
5. **Optional: block new sign-ups.** Authentication → Settings → **User actions**: untick **Enable create (sign-up)** if that option is shown. The security rules already stop anyone who isn't in `admins` from changing anything.

## Using the admin portal

Go to the website address followed by `/admin` (for example lawyerloomis.com/admin), or tap **Staff sign-in** at the bottom of any page.

- **Messages**: contact form messages, newest first. Opening one marks it read.
- **Posts**: write updates and blog posts with photos. Choose a style (Card, Feature, Note, Gallery) and where it appears (Home, Blog, About, Contact). Drafts stay private until published.
- **Message of the day**: the band across the top of the website. Choose a style, a button, which pages show it, and an end date.
- **Page text**: opens any page in editing mode. Tap outlined text, type, then tap Save.
- **Account**: change password. Forgotten passwords are reset from the sign-in screen.

## Free plan limits

Firestore's free tier allows 50,000 reads and 20,000 writes a day. A visit to the home page uses about 10 reads, so the site can handle several thousand visits a day before anything is affected.

## Demo mode

Before the Firebase settings are added, `/admin` offers a demo. It saves only in that browser and never reaches the live website. Tap **Leave demo** to turn it off.
