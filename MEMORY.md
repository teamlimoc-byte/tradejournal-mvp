# MEMORY.md — Maverick Canonical Memory (v2)

Last updated: 2026-03-06

## Identity & Roles
- Assistant name: Maverick
- User: Eric Lim
- Mission board team: Cody, Tracy, Aaron
- Operating workflow (locked):
- Eric gives idea
- Cody/Tracy/Aaron execute scoped tasks
- Maverick QA-gates output
- Only QA-passed outcomes go back to Eric

## Eric — Core Context
- Full name: Eric Soo Lim
- Wife: Alisa Lim
- Primary timezone for user-facing work: America/Los_Angeles
- Preference: concise bullet points unless urgency needs detail
- Style: direct, no fluff, execution-focused

## Strategic Priorities (Locked Order)
1) Daytrading mastery (pass eval → funded → own-capital consistency)
2) Covered-call optimization (AAPL/NVDA) as side system
3) COEX trucking automation until DAT API; scale gradually
4) Future service line: OpenClaw setup/templates (high-fit niche: trucking owner-operators)

## Trading — Operating Memory
- Journal default format (required):
- Mood
- Recovery Metrics
- Setup Context
- Execution
- Psychology
- Rule Adherence
- What I Did Good
- What To Improve
- Lesson Learned
- Next Trade Rule
- Session summary
- Process principles:
- Process > PnL
- Rule-based exits over hope-based holding
- At +50% to TP, move SL to BE (or BE+1 tick) unless structure invalidates
- Indicator policy:
- Keep strict live baseline stable
- No live promotion of experimental versions until compile-gated + verified

## COEX Trucking — Operating Constraints
- Company: COEX TRUCKING CO (MC 839921 / DOT 2435830)
- Base: Ontario/LA, CA
- Equipment: 53’ dry van
- Driver: Kwan (Korean only); Eric relays final comms
- Load constraints:
- Max weight: 20,000 lbs
- Min rate: $1.80/mi
- Dead-zone target: $2.00+/mi
- Max deadhead: 45 mi
- Solo pace: ~600 mi/day
- Broker policy: TQL / CH Robinson / RXO / NTG OR broker credit score 95+
- Seasonal lane preference:
- Winter: south lanes
- Summer: north/east lanes
- Workflow:
- Intake → Qualification → Lane fit → NWS weather risk → Korean warning summary for Kwan → log rate con to `trucking/loads.json` → QA gate

## Build/Execution Policy
- Reliability first; avoid feature churn during reset windows
- Deterministic tasks → scripts/cron
- Judgment tasks → AI turns
- Keep automations quiet, useful, and low-noise

## Infra / Recovery Baseline
- Backup + recovery hardened on 2026-03-06
- Added:
- `RECOVERY.md`
- `tools/backup-now.sh`
- Daily cron backup at 20:30 PT
- GitHub backup flow tested end-to-end and working

## Current Known Links/State
- Tailscale URL currently working: `https://openclaw-1.tail27b4c2.ts.net/`
- Old `openclaw.tail...` hostname tied to older/offline node
- If UI shows CORS origin block, update gateway allowed origins to current host

## Pending (Active)
- Keep MEMORY clean and deduped as canonical source
- Continue Trading Journal reliability improvements
- Continue COEX SOP execution with mission-board assignments
- DAT API approval follow-up remains pending
