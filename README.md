# The Loomis Firm website

A static site for GitHub Pages with an admin portal backed by Firebase. Clean addresses on lawyerloomis.com.

| Address | What it is |
| --- | --- |
| `/` | Home: Bonnie's portrait and the gold title, news from the firm, the scroll-stitched story |
| `/about/`, `/services/`, `/contact/` | Information pages |
| `/blog/` | All posts |
| `/blog/post/#ID` | A single post |
| `/admin/` | Bonnie's admin portal: messages, posts, message of the day, page text |
| `/book/` | Forwards to `/contact/` |

**Connecting Firebase:** see `SETUP.md`.

## 1. Put the site on GitHub

1. In the firm's GitHub account, create a **public** repository named `USERNAME.github.io`, leaving every box unchecked.
2. Upload everything in this folder to the repository's root, keeping the folders.
3. **Settings → Pages**: choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://USERNAME.github.io/`.

## 2. Point lawyerloomis.com at it

1. **Verify the domain**: GitHub profile **Settings → Pages → Add a domain**, enter `lawyerloomis.com`, add the TXT record GitHub shows you at GoDaddy, then Verify.
2. **Custom domain**: repository **Settings → Pages → Custom domain**, enter `lawyerloomis.com`, save.
3. **Free the domain**: unpublish or disconnect the old GoDaddy Website Builder site and turn off domain forwarding.
4. **GoDaddy DNS**:
   - Delete the existing `A` record(s) for `@`.
   - Add four `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - Set the `CNAME` record for `www` to `USERNAME.github.io`.
   - **Leave the MX, autodiscover and email TXT records alone.** The firm's email depends on them.
5. When DNS updates, tick **Enforce HTTPS** in Settings → Pages.

## Files

- `index.html`, `about/`, `services/`, `contact/`, `blog/`, `admin/`, `book/`, `404.html`
- `css/style.css`: the site's look; colors and fonts are at the top. `css/admin.css`: the portal
- `js/firebase-config.js`: Firebase settings (paste them here)
- `js/store.js`: everything that talks to Firebase
- `js/render.js`: how posts and the message of the day are drawn
- `js/site.js`: public pages (posts, banner, contact form, page editing)
- `js/admin.js`: the admin portal
- `js/main.js`: menu and animations
- `firestore.rules`: database security rules to paste into Firebase
- `images/`: photos and logo
