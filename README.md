This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment

Copy `.env.example` to `.env.local` and configure the Supabase values. Project city autocomplete also requires a free GeoNames account username:

```bash
GEONAMES_USERNAME=your_geonames_username
```

Keep this variable server-only. Do not rename it with a `NEXT_PUBLIC_` prefix. The application sends city searches through `/api/cities`, where requests are country-scoped and briefly cached.

### Bootstrap a new studio

Use the interactive bootstrap command once for a new studio and its first administrator. It loads `.env.local` by default; pass an explicit environment file for a production target. The command prints the target Supabase URL and requires a deliberate confirmation before writes.

```bash
pnpm bootstrap-studio
pnpm bootstrap-studio -- --env-file .secrets/production.env
```

The environment file must provide `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Keep production files under `.secrets/`, which is ignored by Git.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
