# FLICKCANVAS Facebook Auto-Posting

The project now contains a protected endpoint that posts the current TMDB trending movie to a Facebook Page.

## Required environment variables

```env
SITE_URL=https://flickcanvas.vercel.app
FACEBOOK_PAGE_ID=YOUR_PAGE_ID
FACEBOOK_PAGE_ACCESS_TOKEN=YOUR_PAGE_ACCESS_TOKEN
FACEBOOK_GRAPH_VERSION=v23.0
FACEBOOK_CRON_SECRET=YOUR_RANDOM_SECRET
```

Do NOT put these secrets into GitHub or browser-side JavaScript.

## How it works

Vercel Cron calls:

`/api/facebook/auto-post`

The endpoint:
1. Gets a trending movie from TMDB.
2. Builds a FLICKCANVAS movie-details URL.
3. Sends a Page feed post through the Meta Graph API.

The post contains the movie title, rating, release date, overview, FLICKCANVAS URL and hashtags.

## Meta/Facebook setup

You need a Meta developer app, your Facebook Page, the appropriate Page posting permissions, and a valid Page Access Token. Facebook must allow the app/account to manage and publish to that Page.

The exact Meta permission/token flow can change, so use Meta's current developer dashboard/documentation when creating the token.

## Testing locally

After adding the values to `.env`, run the server and call:

`http://localhost:3000/api/facebook/auto-post?secret=YOUR_RANDOM_SECRET`

If Facebook accepts the token and permissions, the post is created on the Page.

## Important

The current cron is configured for 12:00 UTC daily. Adjust the Vercel cron schedule if you want a different time. The cron configuration only runs in the deployed Vercel environment; local testing uses the URL above.
