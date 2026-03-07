# TOOLS.md - Local Notes

## Web Search
- **Brave Search** (primary): native `web_search` tool — 2,000 searches/month ($5 plan, covered by $5 credit)
- **SerpAPI** (backup, 250/month free): `tools/serpapi-search.sh "query"`
- `web_fetch` works for pulling specific URLs
- ⚠️ Don't blow past 2,000 Brave searches — $5 hard limit set

## TradingView
- Indicator file: `/tradingview/bos-entry-indicator.pine`
- Send updates via `message` tool with `filePath`

## Google Calendar
- **Apps Script URL:** https://script.google.com/macros/s/AKfycbxJVHJQA9WZNhAcm_1XqHFUJPOBnpiWYL-8_5tZjYztDO_CWtNNGqQDWotB-vSQ5vpSXA/exec
- **List events:** ?action=list
- **Add event:** ?action=add&title=X&start=ISO&end=ISO&location=X&allDay=true/false
- **Delete event:** ?action=delete&eventId=X
- Returns today + tomorrow events as JSON
- Used in morning briefing cron job

## Geotab Fleet Tracking
- **URL:** https://my.geotab.com/coex/
- **User:** coexcarriers@gmail.com
- **Database:** coex
- **API endpoint:** https://my.geotab.com/apiv1/
- **Truck 5 device ID:** b6 (Kwan's active truck, plate YP06769 CA)
- **Trailer 16 device ID:** b13
- **Auth:** POST method=Authenticate → get sessionId → use for calls
- ⚠️ Change password — was shared over chat

## Trucking — Invoice Tracker (Google Sheets)
- **Apps Script URL (NEW):** https://script.google.com/macros/s/AKfycbxnZjNWx-z3EYswXSaWGlJMCazw7MeBW7KrirxtxS3J-nIpELO2owk9tWbdUpqAlaWZ8g/exec
- **Auth:** append `?key=YOUR_SECRET` to every request
- **Add row:** `?key=YOUR_SECRET&action=add&date=YYYY-MM-DD&invoice=XXX&load=XXX&broker=XXX&amount=XXX`
- **Update payment:** `?key=YOUR_SECRET&action=update&invoice=XXX&received_date=YYYY-MM-DD&received_amount=XXX`
- **List rows:** `?key=YOUR_SECRET&action=list`
- **Status:** old invoice sheet/endpoint retired and replaced by this one
- **Next invoice number:** 978 (last used: 977 for FitzMark Order# 2228569)

## Household Budget (Google Sheets)
- **Sheet URL:** https://docs.google.com/spreadsheets/d/1VAti2HIOJLWGBxmfHhAafeiMHT1n_rAoNXUbqRFzUyQ/edit
- Purpose: log household spend + remaining by category (groceries, brady, eating out, subscriptions)
- Pending: deploy Apps Script web endpoint for write access from automation

## Trucking
- Load Scout agent: `/agents/load-scout/`
- DAT API: awaiting approval

## Reddit
- **Reddit .json endpoints are BLOCKED** (require auth, returns 403)
- Use `web_search` with `site:reddit.com <query>` instead (works via Brave)
- `web_fetch` on Reddit URLs also returns 403
- No Reddit API set up (requires developer app, not worth the hassle)

## Oura Ring
- **API Token:** stored at `.oura-token` (chmod 600)
- **Base URL:** `https://api.ouraring.com/v2/usercollection/`
- **Endpoints:** `personal_info`, `daily_sleep`, `daily_readiness`, `daily_activity`, `heartrate`, `sleep`
- **Auth:** `Authorization: Bearer $(cat /root/.openclaw/workspace/.oura-token)`
- **Usage:** Pull sleep/readiness/activity into morning briefing
- **Eric's profile:** age 39, 90.2kg (~199lbs), 1.8m (5'11")

## Spotify
- **Client ID:** 5f115e165dfd45bba1d76b799ac6898f
- **Tokens file:** `.spotify-tokens.json` (chmod 600)
- **Scopes:** playback state, modify playback, currently playing, playlists, top tracks, recently played
- **Usage:** Refresh token → get access token → call API
- **Account:** Eric Lim

## Stock Data
- yfinance works out of the box via exec/python
- Web search + fetch for news/sentiment analysis

## Model Routing (Eric)
- **Routine ops (cheap/default):** `openai/gpt-4o-mini`
  - Trading journal updates
  - COEX trucking tracking/status messages
  - Cron/admin tasks, reminders, summaries
- **Reasoning & strategy:** `openai/gpt-5`
  - Multi-step planning
  - Trading chart review + strategy discussion
  - Higher-quality conversation/judgment
- **Coding/build tasks:** `openai/o1-codex`
  - Indicator coding/refactors
  - Dispatch/team tooling code
  - Production build/debug work

Rule of thumb: start cheap (`4o-mini`) unless the task clearly needs stronger reasoning (`gpt-5`) or heavy coding (`o1-codex`).

## Discord Routing (Eric)
- **Guild ID:** 1475698231852666960
- **Trading Channel ID:** 1475719982493990994
- DM works; server channel routing validated with channel ID targeting.

## Telegram Forum Topics (Eric & Maverick)
- **Chat ID:** `-1003505002823`
- **Topics:**
  - Brainstorm → `threadId: 39`
  - Trading → `threadId: 40`
  - Coex → `threadId: 41`
  - Auto/Cron → `threadId: 42`
  - Queue → `threadId: 43`
  - Build → `threadId: 44`
- **Auto-sync mode (enabled by Eric, 2026-02-28):**
  - Mirror meaningful DM updates into matching topic
  - Skip casual chatter
  - Bundle updates to avoid spam (one concise summary per topic per update block)
  - Post only when there is a decision, status change, blocker, or actionable next step
  - Use prefixes for scanability:
    - `[DM Sync]` context snapshot
    - `[Decision]` final call made
    - `[Blocker]` issue preventing progress
    - `[Next]` clear next action / owner
