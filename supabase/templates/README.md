# Auth email templates

Branded HTML for every Supabase auth email. Paste each file's contents into
**Supabase Dashboard → Authentication → Emails (Templates)** — one template
per slot — and set the subject line from the table below.

| Dashboard slot        | File                    | Subject line                                    |
| --------------------- | ----------------------- | ----------------------------------------------- |
| Confirm signup        | `confirm-signup.html`   | Confirm your email — your first invite awaits 💌 |
| Magic Link            | `magic-link.html`       | Your magic sign-in link 💌                       |
| Invite user           | `invite.html`           | You've been invited to RSVPplease 💌             |
| Change Email Address  | `change-email.html`     | Confirm your new email address                  |
| Reset Password        | `reset-password.html`   | Reset your RSVPplease password                  |
| Reauthentication      | `reauthentication.html` | Your RSVPplease verification code               |

Notes
- **Confirm signup vs Magic Link:** the app signs everyone in with
  `signInWithOtp`. Supabase sends *Confirm signup* to brand-new users and
  *Magic Link* to returning ones — so both matter for the sign-in flow.
- **"Invited someone but they got the Confirm email":** Supabase only sends
  the *Invite user* template for addresses with **no account yet** (via
  dashboard → Users → Invite user). If the address already has an account
  that was never confirmed (e.g. a sign-in email that didn't arrive), every
  later magic-link or invite **re-sends Confirm signup** instead — by design.
  The fix is simply for that person to tap the confirm link once; after that
  they get Magic Link emails like everyone else.
- Templates use Supabase's Go variables: `{{ .ConfirmationURL }}`,
  `{{ .Email }}`, `{{ .NewEmail }}` (change-email), `{{ .Token }}` (reauth).
  Don't rename them.
- Design is email-safe: table layout + inline styles only (no webfonts, no
  flexbox), 560px card, works in Gmail / Outlook / Apple Mail. Brand tokens:
  petal `#E58AA9`, ink `#15223F`, blush `#FCEFF4`, border `#F1D4E0`.
- These files are documentation/source-of-truth — they are **not** deployed
  automatically; the dashboard paste is what takes effect.
