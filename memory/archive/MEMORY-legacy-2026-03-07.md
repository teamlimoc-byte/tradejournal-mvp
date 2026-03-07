# MEMORY.md — Maverick's Long-Term Memory

> Last audited: 2026-03-04. Archive at memory/archive/.


## Identity
<!-- kept: 2026-03-04, reason: active core context -->
- Name changed from Brady to **Maverick** on 2026-02-17
- Reason: Brady is Eric's dog's name, wife suggested the change
- Eric picked Maverick — direct, gets things done


## Eric Lim
<!-- kept: 2026-03-04, reason: active core context -->
- Full name: Eric Soo Lim (Soo is middle name)
- Wife: Alisa Lim
- CEO of COEX TRUCKING CO (MC 839921 / DOT 2435830)
- Owner-operator, 12 years in business, Los Angeles CA
- 1 truck, 53' dry van, solo driver named Kwan
- Goal: scale into a truck dispatching company managing other owner-operators
- Communicates via Telegram
- Direct, no-nonsense. Wants results, not fluff.


## Business — COEX TRUCKING CO
<!-- kept: 2026-03-04, reason: active core context -->
- Home base: Ontario, CA
- Equipment: 53' dry van
- Uses DAT One for load searching


## Eric's Schedule
<!-- kept: 2026-03-04, reason: active core context -->
- 6am wake, 6:30am market prep, 6:45am-1pm PST trading (after 15min ORB)
- Max 3 trades/day then walk away
- Trucking: Wednesdays — find loads leaving Thursday from Ontario CA
- Prefers bullet points, detailed only if urgent


## Trading — LUCID Prop Firm
<!-- kept: 2026-03-04, reason: active core context -->
- Account: $25,016 (updated Feb 20, 2026)
- Target: $26,250 | Remaining: $1,234
- Feb 20 Trade 1: Long MNQ 24,884.75 → TP 24,959.75, +75pts, +$149


## Eric's Trading Psychology
<!-- kept: 2026-03-04, reason: active core context -->
- Cuts winners too short (especially exits at breakeven after drawdown recovery)
- Holds losers too long
- Chickens out of valid entries
- Win rate goal: 70%
- Prop firm: LUCID 25k flex, $1k max drawdown, balance $25,016, target $26,250


## Cron / Job Architecture Rule
<!-- kept: 2026-03-04, reason: active core context -->
- **Deterministic** (GPS check, data fetch, sheet update, weather pull, file write) → bash/Python script + system cron. Zero tokens, zero AI cost.
- **Judgment required** (analyze data, make decisions, draft messages, communicate) → AI agent turn.
- Apply this to every new job. Refactor old agent crons to scripts where possible.


## Goals & Strategy (locked)
<!-- kept: 2026-03-04, reason: active core context -->
- Eric confirmed long-term priority order:
  1) Daytrading mastery first (pass eval, funded account, then own-capital consistency)
  2) Covered-call monitoring automation (AAPL/NVDA) as side optimization
  3) COEX trucking automation until DAT API, then gradual expansion
  4) Future service business: OpenClaw A-to-Z setup with vertical templates
- High-conviction niche for expansion: trucking owner-operators (strong domain fit + clear operational pain).
- Operating principle: expand gradually and keep systems stable; avoid distraction from core trading mission.
- TradeJournal preference (confirmed 2026-03-04): Eric wants the detailed narrative format for daily trading journal entries with these sections: Mood, Recovery Metrics, Setup Context, Execution, Psychology, Rule Adherence, What I Did Good, What To Improve, Lesson Learned, Next Trade Rule, Session summary.


## Kwan's Load Criteria
<!-- kept: 2026-03-04, reason: distilled operating constraints -->
- Max weight: 20,000 lbs
- Min rate: $1.95/mile (dead zones: $2.50+)
- Max deadhead: 45 miles
- Solo pace: ~600 miles/day
- Approved brokers only: TQL, CH Robinson, RXO, NTG
- Seasonal lanes: winter (TX/AL/LA/MS/SC/JAX), summer (MN/WI/IL/IN/PA/MD/NJ/VA), otherwise no-go


## Key Decisions
<!-- kept: 2026-03-04, reason: distilled active decisions -->
- Keep live trading indicator strict; all experimentation stays in versioned non-live files.
- Morning reports should be consolidated to one 6:30 AM PT packet (no duplicates).
- Deterministic jobs use scripts/cron; judgment jobs use AI agent turns.
- Use run-mode subagents with manager QA gate before shipping changes.
- **Execution workflow rule (Eric-confirmed):** Eric gives idea → Maverick assigns to Cody/Tracy/Aaron for execution → subagent reports back to Maverick → Maverick performs QA gate → only then update Eric.


## Trading — TradingView Indicator
<!-- kept: 2026-03-04, reason: distilled active indicator memory -->
- Live strict baseline: `/tradingview/bos-entry-indicator-v69b.pine`
- Current stable working branch for active use: v7.1.5 family until clean unified rebuild is verified.
- Eric preference: clean chart, actionable setup/trigger context, no misleading broker-inaccurate counters.


## Trucking — Load & Weather Process
<!-- kept: 2026-03-04, reason: distilled workflow rule -->
- Rate confirmations logged at `trucking/loads.json`.
- On each new load, run documented intake + weather process (NWS API) and translate critical warnings to Korean for Kwan.
- Flag high-risk weather zones (especially Flagstaff AZ corridor).


## Pending
<!-- kept: 2026-03-04, reason: distilled currently actionable items -->
- DAT API approval follow-up remains pending.
- Trading indicator clean unified rebuild + stable trigger behavior validation.
- TradeJournal workflow reliability and daily detailed journal consistency.
