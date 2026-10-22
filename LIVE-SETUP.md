# Make the IT Payment Tracker live

The current `index.html` is a local-only version. This setup file prepares the database structure for a shared version, but the live app still needs to be connected to a cloud project and deployed to an account you control.

## What is required

- A Supabase account and project for the PostgreSQL database and email sign-in.
- A static hosting account such as Netlify or Vercel for the web page.
- Approval from your IT/Finance team to put vendor, invoice, and payment reference data in that cloud service.

Free tiers have limits and can change. Check current plan limits before adopting this for business records. See [Supabase pricing](https://supabase.com/pricing).

## Database setup

1. Create a Supabase project in the organization-approved region.
2. Open **SQL Editor**, paste the contents of `supabase-schema.sql`, and run it.
3. In **Authentication** settings, turn off public sign-ups. Invite only the people who should use the tracker.
4. In **Project Connect** or **API Keys**, copy the project URL and the publishable key (older projects may label this the `anon` key).
5. Never place a `service_role` key or secret key in the browser app. The database policies are designed for a signed-in user and a publishable key.

The supplied SQL lets authenticated users share the same register. All authenticated users can read and update records; only invited users should be able to sign in. If access needs to be limited by department, we should add department or user-specific policies before launch.

## Hosting

The current local page has not yet been connected to Supabase. The next code step is to add a sign-in screen and replace browser-only storage with authenticated database reads and writes. Then deploy the resulting static files through your hosting account. A hosting URL alone does not secure the data; the database policies and restricted user access are essential.

## Local backup

Keep using **Backup data** / **Export CSV** in the current local tracker until the connected live version has been deployed and verified. Do not enter real business records into a public demo or share project secrets in chat.
