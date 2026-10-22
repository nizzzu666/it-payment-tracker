# Secure live setup

The GitHub Pages site is public. This version of the app uses Supabase email/password sign-in and a shared PostgreSQL database. The database controls Master and User access with Row Level Security. The GitHub Pages site will not work with accounts or shared data until a Supabase project is connected.

## Roles

- **Master** can view and edit invoices, delete invoices, and change other users between Master and User.
- **User** can view and add/edit invoices, but cannot delete them or change roles.
- Public sign-up is disabled. Every account must be invited from Supabase Authentication. New invitations receive the User role automatically.
- A Master role must be granted by the project owner in the database. A user cannot assign the Master role to their own account.

## Configure Supabase

1. Create a Supabase project in a region approved by your organization.
2. Open **SQL Editor**, paste and run `supabase-schema.sql`.
3. In **Authentication > Providers**, enable Email. Disable public sign-ups. Invite your own account first.
4. In **Table Editor > it_user_roles**, find your invited email and change its role to `master` (or use the SQL below). The trigger creates a `user` row automatically when an account is invited.
5. Invite other staff from **Authentication > Users**. They sign in with the **User** option. The Master can promote or demote another account in the app's User access panel.
6. In **Authentication > URL Configuration**, set the Site URL to `https://nizzzu666.github.io/it-payment-tracker/` and add that exact URL to the Redirect URLs allow-list for password resets.
7. In **Project Settings > API**, copy the Project URL and publishable key (older projects may call it the `anon` key) into `config.js`.

To grant the initial Master role in SQL, replace the example address with the invited account's email:

```sql
update public.it_user_roles
set role = 'master'
where lower(email) = lower('your-work-email@example.com');
```

Never put a `service_role` key or secret key in `config.js` or any browser code. A publishable/anon key is intended for browser use only when RLS is enabled and the policies are applied.

## Deploy

After setting `config.js`, commit and push the changes to the `main` branch. GitHub Pages will rebuild the site. Verify sign-in and each role before entering real invoices.

## Password and account controls

Use unique passwords. Configure Supabase Auth to require email confirmation for invited accounts and its strongest available password policy, including leaked-password protection where available. Password reset links should be sent only to the account's verified email. Keep the GitHub repository public because it hosts the page; it must contain no private database keys or real payment records.

This version does not require authenticator MFA, per your request. Supabase Auth supports adding TOTP MFA later.

## Data and backup

Payment records are stored in the shared Supabase database, not in browser local storage. **Backup data** downloads a JSON copy and **Export CSV** creates a spreadsheet-ready copy. Store backups only in an approved company location.

Confirm with your IT/Finance team that the selected cloud service and region are approved before entering vendor invoices or UTR references. Free-plan limits and terms can change; see [Supabase pricing](https://supabase.com/pricing).
