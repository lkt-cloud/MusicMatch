# Setting up accounts, data and payments

Right now the site runs in **demo mode**: sample people, and everything is saved only in your own browser.
These steps switch it to **live mode**: real sign-ups, a shared database, and paid promotions with Stripe
(in **test mode**, so no real money moves).

You'll need about 45 minutes. Do the parts in order.

---

## Part 1 — Supabase (accounts + database)

1. Go to **supabase.com** → sign up (free) → **New project**.
   - Name: `music-match` · Database password: make one and save it somewhere · Region: the one closest to you.
   - Wait ~2 minutes for it to finish setting up.
2. Create the tables. In your project open **SQL Editor** → **New query**:
   - Open `supabase/migrations/20261008000001_core.sql` from this folder, copy everything, paste, click **Run**.
   - Do the same, one at a time and in this order, with:
     - `supabase/migrations/20261008000002_promotions.sql`
     - `supabase/migrations/20261009000001_location_rates.sql`
     - `supabase/migrations/20261010000001_genre_check.sql`
   - You should see "Success. No rows returned" each time (4 in total).
   - If you already ran some earlier, just run the ones you haven't.
3. Get your keys: **Project Settings → API**.
   - In this project folder, copy `.env.example` to a new file named `.env`.
   - Paste the **Project URL** into `VITE_SUPABASE_URL` and the **anon public** key into `VITE_SUPABASE_ANON_KEY`.
   - These two are safe in the website. Never put the **service_role** key in `.env` or anywhere in the site.
4. **Authentication → Sign In / Providers → Email**: leave it on. While testing, you can switch off
   **Confirm email** so new accounts work without clicking an email link.
5. **Authentication → URL Configuration**: set **Site URL** to `http://localhost:5173` for now
   (you'll change it to your Vercel address in Part 5).
6. Restart the site (`npm run dev`). You should now see a **Sign in** page. Create an account, then go to
   **Profile → Edit profile** and set your city so you appear on the map. Your pin shows only your city
   unless you pick **Use my exact spot** under **Your pin on the map**.

> Note: in live mode the sample people disappear. The map shows real users only.

---

## Part 2 — Stripe (payments, test mode)

1. Go to **stripe.com** → sign up and pick **Japan** as the country. This can't be changed later, and it's
   what sends payouts (in yen) to your Japanese bank. You don't need to add business details yet.
2. Make sure you're in **Test mode** or a **sandbox** (top of the dashboard).
3. **Developers → API keys** → reveal and copy the **Secret key** (starts with `sk_test_`).
4. Create the three products by running this in the project folder. It asks for your key without showing it:

   ```bash
   read -s "STRIPE_SECRET_KEY?Paste your sk_test_ key, then press Enter: " && export STRIPE_SECRET_KEY && node scripts/stripe-setup.mjs
   ```

   You'll see three "Created …" lines. Running it again is harmless.

   | Product | Everyone else | People in Japan |
   | --- | --- | --- |
   | Boost a post (7 days) | $5 | ¥750 |
   | Featured profile | $7 / month | ¥1,000 / month |
   | Studio listing | $15 / month | ¥2,250 / month |

   Which one someone pays depends on the country in their profile. Stripe converts dollar payments to yen
   when it pays you.

---

## Part 3 — The payment server (Supabase Edge Functions)

Payments need a small server that holds your secret Stripe key. It runs on Supabase, so there's nothing to host yourself.

1. Log in to Supabase from the terminal (a browser window opens to approve):
   ```bash
   npx supabase login
   ```
2. Connect this folder to your project. Your **project ref** is the random part of your Project URL
   (`https://THIS-PART.supabase.co`):
   ```bash
   npx supabase link --project-ref YOUR-PROJECT-REF
   ```
3. Give the server your Stripe key and your site's address:
   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=sk_test_YOURKEY APP_URL=http://localhost:5173
   ```
4. Upload the three functions:
   ```bash
   npx supabase functions deploy create-checkout
   npx supabase functions deploy cancel-promotion
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   ```
5. Tell Stripe where to send payment confirmations. In Stripe: **Developers → Webhooks → Add endpoint**.
   - **Endpoint URL**: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook`
   - **Events to send** — pick these 8:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Save, then click **Reveal** under **Signing secret** (starts with `whsec_`) and run:
   ```bash
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOURSECRET
   ```

---

## Part 4 — Test a payment

1. In the site, post something in **Community**, then press **Boost** on it → **Continue · $5**.
2. On Stripe's checkout page use the test card **4242 4242 4242 4242**, any future expiry date, any CVC, any ZIP.
3. You land on **Your promotions**. Within a few seconds the boost shows **Active**, and the post sits at the
   top of Community marked **Promoted**.
4. Try **Profile → Promote → Featured profile** ($7/mo) the same way, then **Cancel** it on Your promotions.
   It stays on until the end of the month that's paid for, then switches off.
5. A card that gets declined: **4000 0000 0000 0002**.

If something doesn't switch on: Stripe → **Developers → Webhooks → your endpoint** shows each delivery and
any error. Supabase → **Edge Functions → stripe-webhook → Logs** shows what the server did.

---

## Part 5 — Put it online (Vercel)

1. Put the project on **GitHub** (ask me and I'll set up git and walk you through pushing it).
2. **vercel.com** → sign up with GitHub → **Add New → Project** → import the repo. Vercel detects Vite automatically.
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as your `.env`) → **Deploy**.
4. Once you have your address (e.g. `https://music-match.vercel.app`):
   - Supabase **Authentication → URL Configuration**: set **Site URL** to it.
   - Update the server: `npx supabase secrets set APP_URL=https://music-match.vercel.app`

---

## Later — taking real money

When everything works in test mode: complete your business details in Stripe (as a Japanese sole
proprietor or company, with your Japanese bank account for payouts). Japanese law also expects online
sellers to publish a 特定商取引法に基づく表記 page (seller name, address, contact, prices, refund policy), and
Stripe Japan usually asks for its link when you activate; ask me to add that page to the site.

Then switch the dashboard to **Live mode** and repeat Part 2 step 4 and Part 3 steps 3 and 5 with your
**live** keys. (The setup script refuses live keys on purpose; ask me to lift that when you're ready.)

---

## What's where (for reference)

| Piece | File |
| --- | --- |
| Database tables + security rules | `supabase/migrations/` |
| Start a checkout | `supabase/functions/create-checkout/` |
| Payment confirmations (the only thing that turns promotions on) | `supabase/functions/stripe-webhook/` |
| Cancel a promotion | `supabase/functions/cancel-promotion/` |
| Prices shown in the app | `src/data/pricing.ts` |
| Products created in Stripe | `scripts/stripe-setup.mjs` |
