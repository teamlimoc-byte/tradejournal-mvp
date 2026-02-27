const DATA_CANDIDATES = [
  './data/trades.json',
  './data/live-journal.json',
  '../../trading/live-journal/output/trades.json',
  '../live-journal/data/trades.json',
  '../live-journal/output/trades.json'
];

const LOCAL_TRADES_KEY = 'trading-platform-mvp.localTrades.v1';
const COMMISSION_RT_KEY = 'trading-platform-mvp.commissionRt.v1';
const THEME_KEY = 'trading-platform-mvp.theme.v1';

const MOCK_DATA = {
  trades: [
    { id: 'T-1024', date: '2026-02-20', symbol: 'NVDA', assetType: 'stock', side: 'Long', setup: 'ORB', qty: 100, entry: 714.5, exit: 721.8, pnl: 730, r: 1.4, tags: ['A+ setup', 'trend'], notes: 'Strong open drive + continuation.' },
    { id: 'T-1025', date: '2026-02-20', symbol: 'TSLA', assetType: 'stock', side: 'Short', setup: 'Fade', qty: 80, entry: 212.9, exit: 214.2, pnl: -104, r: -0.4, tags: ['overtrade'], notes: 'Entered too early before rejection confirmation.' }
  ],
  journal: []
};

const state = {
  data: null,
  filters: { symbol: '', side: 'All', setup: 'All', dateFrom: '', dateTo: '', sort: 'date-desc' },
  reportFilters: { dateFrom: '', dateTo: '', assetType: 'all', sortBy: 'pnl' },
  selectedTrade: null,
  formMounted: false,
  editTradeId: null,
  commissionPerContractRt: 1,
  importStatus: ''
};

const fmtMoney = v => `${v >= 0 ? '+' : '-'}$${Math.abs(Number(v || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtNum = v => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function inferAssetType(symbol = '') {
  const s = String(symbol || '').toUpperCase();
  if (/^[MESNQRTYGC6ECLYM][A-Z]\d$/.test(s) || /^MNQ|^NQ|^MES|^ES/.test(s)) return 'futures';
  return 'stock';
}

function normalizeTradeSchema(t) {
  const trade = { ...(t || {}) };
  trade.assetType = String(trade.assetType || inferAssetType(trade.symbol));
  trade.underlying = String(trade.underlying || trade.symbol || '').toUpperCase();
  trade.strategy = String(trade.strategy || trade.setup || '');

  // Options fields (backward-compatible defaults for non-options trades)
  if (trade.assetType === 'options') {
    trade.optionType = String(trade.optionType || '').toUpperCase();
    trade.expiry = String(trade.expiry || '');
    trade.strike = Number(trade.strike || 0) || 0;
    trade.contracts = Number(trade.contracts || trade.qty || 0) || 0;
  } else {
    trade.optionType = trade.optionType || '';
    trade.expiry = trade.expiry || '';
    trade.strike = Number(trade.strike || 0) || 0;
    trade.contracts = Number(trade.contracts || 0) || 0;
  }

  return trade;
}

function normalizeDataSchema(data) {
  const out = { ...(data || {}) };
  out.trades = (out.trades || []).map(normalizeTradeSchema);
  out.journal = out.journal || [];
  return out;
}
const isLocalTrade = (t) => String(t?.id || '').startsWith('MAN-') || String(t?.id || '').startsWith('CSV-');
const effectiveCommission = (t) => {
  const explicit = Number(t?.commission);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const qty = Number(t?.qty || 1);
  return Math.max(0, qty) * Number(state.commissionPerContractRt || 0);
};
const netPnl = (t) => Number(t?.pnl || 0) - effectiveCommission(t);

function readLocalTrades() {
  try {
    const raw = localStorage.getItem(LOCAL_TRADES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function loadCommissionSetting() {
  try {
    const v = Number(localStorage.getItem(COMMISSION_RT_KEY));
    if (Number.isFinite(v) && v >= 0) state.commissionPerContractRt = v;
  } catch (_) {}
}

function saveCommissionSetting(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return;
  state.commissionPerContractRt = n;
  localStorage.setItem(COMMISSION_RT_KEY, String(n));
}

function writeLocalTrades(trades) {
  localStorage.setItem(LOCAL_TRADES_KEY, JSON.stringify(trades));
}

function syncLocalTradesFromState() {
  writeLocalTrades((state.data?.trades || []).filter(isLocalTrade));
}

async function loadData() {
  for (const path of DATA_CANDIDATES) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if (!r.ok) continue;
      const parsed = await r.json();
      if (parsed?.trades?.length) {
        const local = readLocalTrades();
        const byId = new Map();
        // Prefer server data first; only add local trades that are missing by id.
        for (const t of parsed.trades) byId.set(String(t.id || ''), t);
        for (const t of local) {
          const id = String(t?.id || '');
          if (!id || !byId.has(id)) byId.set(id, t);
        }
        parsed.trades = Array.from(byId.values());
        return normalizeDataSchema(parsed);
      }
    } catch (_) {}
  }
  return normalizeDataSchema({ ...MOCK_DATA, trades: [...MOCK_DATA.trades, ...readLocalTrades()] });
}

function getTrades() {
  const trades = (state.data?.trades || []).filter(t => {
    if (state.filters.symbol && !String(t.symbol || '').toLowerCase().includes(state.filters.symbol.toLowerCase())) return false;
    if (state.filters.side !== 'All' && t.side !== state.filters.side) return false;
    if (state.filters.setup !== 'All' && t.setup !== state.filters.setup) return false;
    if (state.filters.dateFrom && t.date < state.filters.dateFrom) return false;
    if (state.filters.dateTo && t.date > state.filters.dateTo) return false;
    return true;
  });

  const sorted = [...trades];
  const sorter = {
    'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''),
    'date-asc': (a, b) => (a.date || '').localeCompare(b.date || ''),
    'pnl-desc': (a, b) => netPnl(b) - netPnl(a),
    'pnl-asc': (a, b) => netPnl(a) - netPnl(b),
    'r-desc': (a, b) => Number(b.r || 0) - Number(a.r || 0),
    'r-asc': (a, b) => Number(a.r || 0) - Number(b.r || 0)
  }[state.filters.sort] || (() => 0);

  return sorted.sort(sorter);
}

function computeKpis(trades) {
  const pnlValues = trades.map(t => netPnl(t));
  const totalPnl = pnlValues.reduce((s, v) => s + v, 0);
  const wins = trades.filter(t => netPnl(t) > 0);
  const losses = trades.filter(t => netPnl(t) <= 0);
  const grossWin = wins.reduce((s, t) => s + netPnl(t), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(netPnl(t)), 0);
  const count = trades.length;
  const winRate = count ? (wins.length / count) * 100 : 0;
  const avgR = count ? trades.reduce((s, t) => s + Number(t.r || 0), 0) / count : 0;
  const expectancy = count ? totalPnl / count : 0;
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  return { totalPnl, count, winRate, avgR, expectancy, profitFactor, wins: wins.length, losses: losses.length };
}

function renderKpis(rootSel, trades) {
  const el = document.querySelector(rootSel);
  if (!el) return;
  const k = computeKpis(trades);
  el.innerHTML = `
    <div class="panel"><div class="kpi-label">Net P&L</div><div class="kpi-value ${k.totalPnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(k.totalPnl)}</div></div>
    <div class="panel"><div class="kpi-label">Trades</div><div class="kpi-value">${k.count}</div></div>
    <div class="panel"><div class="kpi-label">Win Rate</div><div class="kpi-value">${k.winRate.toFixed(1)}%</div></div>
    <div class="panel"><div class="kpi-label">Average R</div><div class="kpi-value ${k.avgR >= 0 ? 'pos' : 'neg'}">${k.avgR.toFixed(2)}R</div></div>
    <div class="panel"><div class="kpi-label">Expectancy / Trade</div><div class="kpi-value ${k.expectancy >= 0 ? 'pos' : 'neg'}">${fmtMoney(k.expectancy)}</div></div>
    <div class="panel"><div class="kpi-label">Profit Factor</div><div class="kpi-value">${Number.isFinite(k.profitFactor) ? k.profitFactor.toFixed(2) : '∞'}</div></div>
  `;
}

// --- Reports module prep helpers (data layer only; UI wiring on Friday sprint) ---
function toETHour(dateObj) {
  try {
    const hr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }).format(dateObj);
    const n = Number(hr);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function parseTradeTimestamp(trade) {
  // 1) Prefer full timestamps when present
  const fullCandidates = [trade?.entryTimestamp, trade?.boughtTimestamp, trade?.soldTimestamp, trade?.timestamp, trade?.openedAt];
  for (const c of fullCandidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 2) Reconstruct from date + time for legacy/manual rows
  const date = String(trade?.date || '').trim();
  const timeCandidates = [trade?.entryTime, trade?.time].map(v => String(v || '').trim()).filter(Boolean);
  for (const t of timeCandidates) {
    // HH:mm or HH:mm:ss
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t) && date) {
      // Treat manual date+time as New York session time, convert to UTC Date object
      const base = `${date}T${t.length === 5 ? `${t}:00` : t}`;
      // Construct as if local then reinterpret as ET using Intl parts fallback approach
      const naive = new Date(base);
      if (!Number.isNaN(naive.getTime())) return naive;
    }

    // H:mm AM/PM (rare imports)
    if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(t) && date) {
      const d = new Date(`${date} ${t}`);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // Last resort: direct parse
    const direct = new Date(t);
    if (!Number.isNaN(direct.getTime())) return direct;
  }
  return null;
}

function weekdayFromDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
}

function bucketLabelForHourET(hour) {
  if (hour == null) return 'Unknown';
  if (hour < 10) return 'Pre-RTH';
  if (hour < 11) return 'Open Drive';
  if (hour < 14) return 'Midday';
  if (hour < 16) return 'Power Hour';
  return 'Post-RTH';
}

function aggregateByKey(trades, keyFn) {
  const map = new Map();
  for (const t of trades) {
    const key = keyFn(t) || 'Unknown';
    if (!map.has(key)) map.set(key, { key, trades: 0, wins: 0, pnl: 0, rTotal: 0 });
    const row = map.get(key);
    row.trades += 1;
    const n = netPnl(t);
    row.pnl += n;
    row.rTotal += Number(t?.r || 0);
    if (n > 0) row.wins += 1;
  }
  return Array.from(map.values()).map(r => ({
    ...r,
    winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
    avgR: r.trades ? r.rTotal / r.trades : 0
  })).sort((a, b) => b.pnl - a.pnl);
}

function buildReportsSnapshot(trades, journalEntries) {
  const bySetup = aggregateByKey(trades, t => t?.setup || 'Unknown');
  const bySymbol = aggregateByKey(trades, t => t?.symbol || 'Unknown');
  const byWeekday = aggregateByKey(trades, t => weekdayFromDate(t?.date));

  const byTag = aggregateByKey(
    trades.flatMap(t => {
      const tags = Array.isArray(t?.tags) && t.tags.length ? t.tags : ['untagged'];
      return tags.map(tag => ({ ...t, __tag: String(tag) }));
    }),
    t => t.__tag
  );

  const byTimeBucket = aggregateByKey(trades, t => {
    const ts = parseTradeTimestamp(t);
    if (ts) return bucketLabelForHourET(toETHour(ts));

    // Fallback: derive HH:mm already normalized in UI data and treat as ET session time
    const hhmm = deriveEntryTime(t);
    if (/^\d{2}:\d{2}$/.test(String(hhmm || ''))) {
      const hour = Number(String(hhmm).slice(0, 2));
      return bucketLabelForHourET(Number.isFinite(hour) ? hour : null);
    }
    return 'Unknown';
  });

  const journalByDate = new Map((journalEntries || []).map(j => [j.date, j]));
  const withRecovery = trades.map(t => {
    const j = journalByDate.get(t.date) || {};
    const sleep = Number(j.ouraSleepScore);
    const readiness = Number(j.ouraReadinessScore);
    return {
      ...t,
      __recoveryBand: (Number.isFinite(sleep) && Number.isFinite(readiness) && sleep >= 75 && readiness >= 75)
        ? 'High Recovery (>=75/75)'
        : 'Lower Recovery'
    };
  });
  const byRecovery = aggregateByKey(withRecovery, t => t.__recoveryBand);

  return {
    generatedAt: new Date().toISOString(),
    totals: computeKpis(trades),
    bySetup,
    byTag,
    bySymbol,
    byWeekday,
    byTimeBucket,
    byRecovery
  };
}

function renderWeekdayBars(selector, rows) {
  const host = document.querySelector(selector);
  if (!host) return;
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Unknown'];
  const map = new Map((rows || []).map(r => [r.key, r]));
  const items = order.map(k => map.get(k)).filter(Boolean);
  if (!items.length) {
    host.innerHTML = '<div class="panel muted">No weekday data yet.</div>';
    return;
  }
  const maxAbs = Math.max(...items.map(i => Math.abs(i.pnl || 0)), 1);
  host.innerHTML = `
    <div class="panel">
      ${items.map(i => {
        const w = Math.max(4, Math.round((Math.abs(i.pnl || 0) / maxAbs) * 100));
        const c = i.pnl >= 0 ? 'var(--success)' : 'var(--danger)';
        return `<div style="display:grid;grid-template-columns:72px 1fr 90px;gap:8px;align-items:center;margin:6px 0;">
          <div class="small muted">${i.key}</div>
          <div style="height:10px;background:#eef2f7;border-radius:999px;overflow:hidden;"><div style="height:100%;width:${w}%;background:${c};"></div></div>
          <div class="small ${i.pnl>=0?'pos':'neg'}" style="text-align:right;">${fmtMoney(i.pnl)}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function getReportTrades(trades) {
  return (trades || []).filter(t => {
    if (state.reportFilters.dateFrom && t.date < state.reportFilters.dateFrom) return false;
    if (state.reportFilters.dateTo && t.date > state.reportFilters.dateTo) return false;
    const f = String(state.reportFilters.assetType || 'all').toLowerCase();
    if (f !== 'all') {
      const at = String(t.assetType || inferAssetType(t.symbol)).toLowerCase();
      if (at !== f) return false;
    }
    return true;
  });
}

function renderReportControls(selector) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = `
    <div class="toolbar" style="grid-template-columns: 1fr 1fr 1fr 1fr auto; margin-top:10px;">
      <div class="field"><label>Date From</label><input id="rf-date-from" type="date" value="${state.reportFilters.dateFrom || ''}" /></div>
      <div class="field"><label>Date To</label><input id="rf-date-to" type="date" value="${state.reportFilters.dateTo || ''}" /></div>
      <div class="field"><label>Asset Type</label>
        <select id="rf-asset-type">
          <option value="all" ${state.reportFilters.assetType === 'all' ? 'selected' : ''}>All</option>
          <option value="futures" ${state.reportFilters.assetType === 'futures' ? 'selected' : ''}>Futures</option>
          <option value="options" ${state.reportFilters.assetType === 'options' ? 'selected' : ''}>Options</option>
        </select>
      </div>
      <div class="field"><label>Sort Rows By</label>
        <select id="rf-sort">
          <option value="pnl" ${state.reportFilters.sortBy === 'pnl' ? 'selected' : ''}>Net P&L</option>
          <option value="winRate" ${state.reportFilters.sortBy === 'winRate' ? 'selected' : ''}>Win Rate</option>
          <option value="trades" ${state.reportFilters.sortBy === 'trades' ? 'selected' : ''}>Trades</option>
        </select>
      </div>
      <div class="field" style="justify-content:end;"><label>&nbsp;</label><button id="rf-clear" class="btn">Clear</button></div>
    </div>
  `;
  document.querySelector('#rf-date-from')?.addEventListener('change', e => { state.reportFilters.dateFrom = e.target.value || ''; rerender(); });
  document.querySelector('#rf-date-to')?.addEventListener('change', e => { state.reportFilters.dateTo = e.target.value || ''; rerender(); });
  document.querySelector('#rf-asset-type')?.addEventListener('change', e => { state.reportFilters.assetType = e.target.value || 'all'; rerender(); });
  document.querySelector('#rf-sort')?.addEventListener('change', e => { state.reportFilters.sortBy = e.target.value || 'pnl'; rerender(); });
  document.querySelector('#rf-clear')?.addEventListener('click', e => {
    e.preventDefault();
    state.reportFilters.dateFrom = '';
    state.reportFilters.dateTo = '';
    state.reportFilters.assetType = 'all';
    state.reportFilters.sortBy = 'pnl';
    rerender();
  });
}

function renderDashboardBreakdown(trades, selector = '#dashboard-breakdown') {
  const host = document.querySelector(selector);
  if (!host) return;

  const bySetup = {};
  for (const t of trades) {
    const key = t.setup || 'Unknown';
    bySetup[key] ??= { count: 0, pnl: 0 };
    bySetup[key].count += 1;
    bySetup[key].pnl += netPnl(t);
  }

  const topSetups = Object.entries(bySetup).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 5);
  const worstTrades = [...trades].sort((a, b) => netPnl(a) - netPnl(b)).slice(0, 3);

  host.innerHTML = `
    <div class="panel">
      <div class="kpi-label">Top Setups by P&L</div>
      ${topSetups.length ? `<ul class="list-compact">${topSetups.map(([setup, v]) => `<li><strong>${setup}</strong> — ${fmtMoney(v.pnl)} (${v.count} trades)</li>`).join('')}</ul>` : '<div class="muted small">No setup data yet.</div>'}
    </div>
    <div class="panel">
      <div class="kpi-label">Trades to Review</div>
      ${worstTrades.length ? `<ul class="list-compact">${worstTrades.map(t => `<li><strong>${t.date}</strong> ${t.symbol} ${t.side} — <span class="neg">${fmtMoney(netPnl(t))}</span></li>`).join('')}</ul>` : '<div class="muted small">No trades yet.</div>'}
    </div>
  `;
}

function renderEquityCurve(trades, selector = '#equity-curve') {
  const host = document.querySelector(selector);
  if (!host) return;
  const sorted = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!sorted.length) {
    host.innerHTML = '<div class="muted small">No trades yet.</div>';
    return;
  }

  const curve = [];
  let sum = 0;
  for (const t of sorted) {
    sum += netPnl(t);
    curve.push({ date: t.date, value: sum });
  }

  const w = 700, h = 220, pad = 24;
  const vals = curve.map(p => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const range = Math.max(max - min, 1);

  const x = i => pad + (i / Math.max(curve.length - 1, 1)) * (w - pad * 2);
  const y = v => h - pad - ((v - min) / range) * (h - pad * 2);
  const points = curve.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');

  const latest = curve[curve.length - 1]?.value ?? 0;
  const peak = max;

  host.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Equity curve">
      <line x1="${pad}" y1="${y(0)}" x2="${w-pad}" y2="${y(0)}" stroke="#d1d5db" stroke-width="1" />
      <polyline fill="none" stroke="#2563eb" stroke-width="2.5" points="${points}" />
      <circle cx="${x(curve.length-1)}" cy="${y(latest)}" r="3.5" fill="#2563eb" />
      <text x="${pad}" y="14" fill="#6b7280" font-size="11">Start</text>
      <text x="${w-pad-78}" y="14" fill="#6b7280" font-size="11">Peak ${fmtMoney(peak)}</text>
      <text x="${w-pad-84}" y="${Math.max(16, y(latest)-8)}" fill="#6b7280" font-size="11">Now ${fmtMoney(latest)}</text>
    </svg>
  `;
}

function renderDailyHeatmap(trades, selector = '#daily-heatmap') {
  const host = document.querySelector(selector);
  if (!host) return;
  const byDay = {};
  for (const t of trades) {
    const d = t.date;
    if (!d) continue;
    byDay[d] ??= { pnl: 0, count: 0 };
    byDay[d].pnl += netPnl(t);
    byDay[d].count += 1;
  }

  const days = Object.keys(byDay).sort();
  if (!days.length) {
    host.innerHTML = '<div class="muted small">No day-level data yet.</div>';
    return;
  }

  host.innerHTML = days.slice(-35).map(d => {
    const day = byDay[d];
    const v = day.pnl;
    let cls = 'heat-0';
    if (v > 0 && v <= 50) cls = 'heat-1';
    else if (v > 50 && v <= 150) cls = 'heat-2';
    else if (v > 150) cls = 'heat-3';
    else if (v < 0 && v >= -50) cls = 'heat-neg-1';
    else if (v < -50 && v >= -150) cls = 'heat-neg-2';
    else if (v < -150) cls = 'heat-neg-3';

    const tradeLabel = day.count === 1 ? '1 trade' : `${day.count} trades`;
    return `<div class="day-cell ${cls}" title="${d}: ${fmtMoney(v)} (${tradeLabel})"><div class="day-num">${d.slice(5)}</div><div>${fmtMoney(v)}</div><div class="muted" style="font-size:.65rem; margin-top:2px;">${tradeLabel}</div></div>`;
  }).join('');
}

function computeDrawdown(trades) {
  const sorted = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of sorted) {
    equity += netPnl(t);
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
  }
  return maxDd;
}

function renderStrategyAnalytics(trades) {
  const host = document.querySelector('#strategy-analytics');
  if (!host) return;

  const bySetup = {};
  for (const t of trades) {
    const key = t.setup || 'Unknown';
    bySetup[key] ??= { count: 0, wins: 0, pnl: 0, rSum: 0 };
    bySetup[key].count += 1;
    if (netPnl(t) > 0) bySetup[key].wins += 1;
    bySetup[key].pnl += netPnl(t);
    bySetup[key].rSum += Number(t.r || 0);
  }

  const rows = Object.entries(bySetup)
    .map(([setup, v]) => ({
      setup,
      count: v.count,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
      avgR: v.count ? v.rSum / v.count : 0,
      pnl: v.pnl
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 8);

  host.innerHTML = `
    <div class="panel" style="margin-top:10px;">
      <div class="kpi-label">Strategy Analytics</div>
      <div class="small muted" style="margin-top:4px">Max Drawdown: <span class="${computeDrawdown(trades) < 0 ? 'neg' : ''}">${fmtMoney(computeDrawdown(trades))}</span></div>
      ${rows.length ? `
        <div class="table-wrap" style="margin-top:8px;">
          <table>
            <thead><tr><th>Setup</th><th>Trades</th><th>Win%</th><th>Avg R</th><th>P&L</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${r.setup}</td><td>${r.count}</td><td>${r.winRate.toFixed(1)}%</td><td>${r.avgR.toFixed(2)}</td><td class="${r.pnl >= 0 ? 'pos':'neg'}">${fmtMoney(r.pnl)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="muted small" style="margin-top:8px;">No setup analytics yet.</div>'}
    </div>
  `;
}

function renderFilterControls() {
  const setupSet = new Set((state.data?.trades || []).map(t => t.setup).filter(Boolean));
  const setupOptions = ['All', ...Array.from(setupSet)].map(v => `<option ${state.filters.setup === v ? 'selected' : ''}>${v}</option>`).join('');
  const host = document.querySelector('#filters');
  if (!host) return;

  host.innerHTML = `
    <div class="field"><label>Symbol</label><input id="f-symbol" placeholder="MNQ" value="${state.filters.symbol}"/></div>
    <div class="field"><label>Side</label><select id="f-side"><option>All</option><option ${state.filters.side==='Long'?'selected':''}>Long</option><option ${state.filters.side==='Short'?'selected':''}>Short</option></select></div>
    <div class="field"><label>Setup</label><select id="f-setup">${setupOptions}</select></div>
    <div class="field"><label>Date Range</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><input id="f-from" type="date" value="${state.filters.dateFrom}"/><input id="f-to" type="date" value="${state.filters.dateTo}"/></div></div>
    <div class="field"><label>Sort</label><select id="f-sort">
      <option value="date-desc" ${state.filters.sort==='date-desc'?'selected':''}>Date (Newest)</option>
      <option value="date-asc" ${state.filters.sort==='date-asc'?'selected':''}>Date (Oldest)</option>
      <option value="pnl-desc" ${state.filters.sort==='pnl-desc'?'selected':''}>P&L (High to Low)</option>
      <option value="pnl-asc" ${state.filters.sort==='pnl-asc'?'selected':''}>P&L (Low to High)</option>
      <option value="r-desc" ${state.filters.sort==='r-desc'?'selected':''}>R (High to Low)</option>
      <option value="r-asc" ${state.filters.sort==='r-asc'?'selected':''}>R (Low to High)</option>
    </select></div>
  `;

  const bind = (id, key) => document.querySelector(id)?.addEventListener('input', e => { state.filters[key] = e.target.value; rerender(); });
  bind('#f-symbol', 'symbol');
  bind('#f-from', 'dateFrom');
  bind('#f-to', 'dateTo');
  document.querySelector('#f-side')?.addEventListener('change', e => { state.filters.side = e.target.value; rerender(); });
  document.querySelector('#f-setup')?.addEventListener('change', e => { state.filters.setup = e.target.value; rerender(); });
  document.querySelector('#f-sort')?.addEventListener('change', e => { state.filters.sort = e.target.value; rerender(); });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = ['id', 'date', 'entryTime', 'assetType', 'symbol', 'underlying', 'side', 'setup', 'strategy', 'qty', 'contracts', 'expiry', 'strike', 'optionType', 'entry', 'exit', 'pnl', 'commission', 'netPnl', 'r', 'tags', 'notes'];
  const esc = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(','), ...rows.map(t => [
    t.id, t.date, deriveEntryTime(t), t.assetType || '', t.symbol, t.underlying || '', t.side, t.setup, t.strategy || '', t.qty, t.contracts || '', t.expiry || '', t.strike || '', t.optionType || '', t.entry, t.exit, t.pnl, (t.commission || 0), netPnl(t), t.r, (t.tags || []).join('|'), t.notes || ''
  ].map(esc).join(','))].join('\n');
}

function splitCsvLine(line, delimiter = ',') {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(x => x.trim());
}

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length);
  if (!lines.length) return [];

  const sample = lines[0];
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);

  const aliases = {
    id: ['id', 'tradeid', 'ticketid', 'orderid'],
    date: ['date', 'tradedate', 'opendate', 'closedate', 'boughttime', 'soldtime', 'boughttimestamp', 'soldtimestamp'],
    assetType: ['assettype', 'instrumenttype', 'type'],
    symbol: ['symbol', 'ticker', 'instrument'],
    underlying: ['underlying', 'underlyingsymbol'],
    side: ['side', 'direction', 'position', 'action'],
    setup: ['setup', 'strategy', 'playbook', 'pattern'],
    strategy: ['strategy', 'setupname'],
    qty: ['qty', 'quantity', 'size', 'shares', 'contracts'],
    contracts: ['contracts', 'contractqty'],
    expiry: ['expiry', 'expiration', 'expdate'],
    strike: ['strike', 'strikeprice'],
    optionType: ['optiontype', 'callput', 'right'],
    entry: ['entry', 'entryprice', 'open', 'openprice', 'avgentry', 'buyprice'],
    exit: ['exit', 'exitprice', 'close', 'closeprice', 'avgexit', 'sellprice'],
    buyPrice: ['buyprice'],
    sellPrice: ['sellprice'],
    boughtTime: ['boughttime', 'boughttimestamp'],
    soldTime: ['soldtime', 'soldtimestamp'],
    pnl: ['pnl', 'pl', 'grosspnl', 'profit', 'realizedpnl'],
    commission: ['commission', 'commissions', 'fee', 'fees', 'cost', 'costs'],
    netPnl: ['netpnl', 'netpl'],
    r: ['r', 'rmultiple', 'rmult'],
    tags: ['tags', 'tag'],
    notes: ['notes', 'note', 'comment', 'comments', 'journal']
  };

  const idx = {};
  for (const [key, options] of Object.entries(aliases)) {
    idx[key] = headers.findIndex(h => options.includes(h));
  }

  const getField = (parts, key) => {
    const i = idx[key];
    return i >= 0 ? (parts[i] ?? '') : '';
  };

  const parseNum = (v, fallback = 0) => {
    if (v == null || v === '') return fallback;
    const cleaned = String(v).replace(/[$,\s]/g, '').replace(/[()]/g, m => (m === '(' ? '-' : ''));
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], delimiter);
    if (!parts.length) continue;

    const buyPrice = parseNum(getField(parts, 'buyPrice'), 0);
    const sellPrice = parseNum(getField(parts, 'sellPrice'), 0);
    const sideRaw = (getField(parts, 'side') || '').trim().toLowerCase();

    let side = sideRaw.includes('short') || sideRaw === 'sell' ? 'Short' : (sideRaw ? 'Long' : '');
    const boughtTime = String(getField(parts, 'boughtTime') || '');
    const soldTime = String(getField(parts, 'soldTime') || '');
    if (!side && boughtTime && soldTime) {
      side = soldTime < boughtTime ? 'Short' : 'Long';
    }
    if (!side) side = 'Long';

    const entry = parseNum(getField(parts, 'entry'), buyPrice || 0);
    const exit = parseNum(getField(parts, 'exit'), sellPrice || 0);
    const pnlRaw = getField(parts, 'pnl');
    const netPnlRaw = getField(parts, 'netPnl');
    const computedPnl = side === 'Long' ? (exit - entry) : (entry - exit);
    const pnl = pnlRaw ? parseNum(pnlRaw, computedPnl) : computedPnl;
    const commissionFromFile = parseNum(getField(parts, 'commission'), 0);
    const impliedCommission = netPnlRaw ? Math.max(0, pnl - parseNum(netPnlRaw, pnl)) : 0;
    const commission = commissionFromFile || impliedCommission;

    const dateRaw = String(getField(parts, 'date') || '').trim();
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw)
      ? dateRaw.slice(0, 10)
      : /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateRaw)
        ? new Date(dateRaw).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    rows.push(normalizeTradeSchema({
      id: getField(parts, 'id') || `CSV-${Date.now()}-${i}`,
      date,
      symbol: (getField(parts, 'symbol') || '').toUpperCase(),
      assetType: (getField(parts, 'assetType') || '').toLowerCase(),
      underlying: (getField(parts, 'underlying') || '').toUpperCase(),
      side,
      setup: getField(parts, 'setup') || 'CSV Import',
      strategy: getField(parts, 'strategy') || '',
      qty: parseNum(getField(parts, 'qty'), 1),
      contracts: parseNum(getField(parts, 'contracts'), 0),
      expiry: getField(parts, 'expiry') || '',
      strike: parseNum(getField(parts, 'strike'), 0),
      optionType: (getField(parts, 'optionType') || '').toUpperCase(),
      entry,
      exit,
      pnl: Number.isFinite(pnl) ? pnl : 0,
      commission,
      r: parseNum(getField(parts, 'r'), 0),
      tags: String(getField(parts, 'tags') || '').split(/[|;,]/).map(s => s.trim()).filter(Boolean),
      notes: getField(parts, 'notes') || ''
    }));
  }
  return rows;
}

function renderDataOps() {
  const host = document.querySelector('#data-ops');
  if (!host) return;
  host.innerHTML = `
    <div class="panel" style="margin-bottom:10px;">
      <div class="kpi-label">Data Ops</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; align-items:center;">
        <button class="btn" id="export-csv-all" type="button">Export CSV (All)</button>
        <button class="btn" id="export-csv-filtered" type="button">Export CSV (Filtered)</button>
        <label class="btn" for="csv-import-input" style="cursor:pointer;">Import CSV</label>
        <input id="csv-import-input" type="file" accept=".csv,text/csv" style="display:none;"/>
        <label class="small muted">Commission (round-trip / contract)</label>
        <input id="commission-rt" type="number" step="0.01" value="${state.commissionPerContractRt}" style="width:140px;"/>
      </div>
      <div class="small muted" style="margin-top:8px;">If CSV has no commission, net uses qty × round-trip/contract. CSV headers: date,symbol,side,setup,qty,entry,exit,pnl,commission,netPnl,r,tags,notes (id optional).</div>
      <div id="import-status" class="small muted" style="margin-top:8px;">${state.importStatus || ''}</div>
    </div>
  `;

  document.querySelector('#export-csv-all')?.addEventListener('click', () => {
    downloadCsv('trades-all.csv', toCsv(state.data?.trades || []));
  });
  document.querySelector('#export-csv-filtered')?.addEventListener('click', () => {
    downloadCsv('trades-filtered.csv', toCsv(getTrades()));
  });

  document.querySelector('#commission-rt')?.addEventListener('change', (e) => {
    saveCommissionSetting(e.target.value);
    rerender();
  });

  document.querySelector('#csv-import-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();

    const parsed = parseCsv(text);
    const valid = parsed.filter(t => t.symbol && Number.isFinite(Number(t.entry)) && Number.isFinite(Number(t.exit)));
    const skipped = parsed.length - valid.length;

    const imported = valid.map(t => normalizeTradeSchema({
      ...t,
      commission: Number(t.commission || 0) || (Number(t.qty || 1) * Number(state.commissionPerContractRt || 0)),
      id: String(t.id || '').startsWith('CSV-') ? t.id : `CSV-${t.id || Date.now()}`
    }));

    state.data.trades.push(...imported);
    syncLocalTradesFromState();

    state.importStatus = `Import complete: ${imported.length} rows added${skipped ? `, ${skipped} skipped` : ''}.`;

    rerender();
    e.target.value = '';
  });
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function deriveEntryTime(trade) {
  if (trade?.entryTime && /^\d{2}:\d{2}$/.test(String(trade.entryTime))) return String(trade.entryTime);
  const ts = parseTradeTimestamp(trade);
  if (!ts || Number.isNaN(ts.getTime())) return '';
  const hh = String(ts.getHours()).padStart(2, '0');
  const mm = String(ts.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function fillFormForEdit(trade) {
  const form = document.querySelector('#trade-form');
  if (!form || !trade) return;
  form.querySelector('[name="date"]').value = trade.date || '';
  form.querySelector('[name="entryTime"]').value = deriveEntryTime(trade);
  form.querySelector('[name="assetType"]').value = trade.assetType || 'futures';
  form.querySelector('[name="symbol"]').value = trade.symbol || '';
  form.querySelector('[name="underlying"]').value = trade.underlying || '';
  form.querySelector('[name="side"]').value = trade.side || 'Long';
  form.querySelector('[name="setup"]').value = trade.setup || '';
  form.querySelector('[name="strategy"]').value = trade.strategy || '';
  form.querySelector('[name="qty"]').value = trade.qty ?? 1;
  form.querySelector('[name="contracts"]').value = trade.contracts ?? '';
  form.querySelector('[name="expiry"]').value = trade.expiry || '';
  form.querySelector('[name="strike"]').value = trade.strike || '';
  form.querySelector('[name="optionType"]').value = trade.optionType || '';
  form.querySelector('[name="entry"]').value = trade.entry ?? '';
  form.querySelector('[name="exit"]').value = trade.exit ?? '';
  form.querySelector('[name="pnl"]').value = trade.pnl ?? '';
  form.querySelector('[name="commission"]').value = trade.commission ?? effectiveCommission(trade);
  form.querySelector('[name="r"]').value = trade.r ?? '';
  form.querySelector('[name="tags"]').value = (trade.tags || []).join(', ');
  form.querySelector('[name="notes"]').value = trade.notes || '';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = 'Update Trade';
}

function validateTradeInput(trade, allTrades = []) {
  const errs = [];
  if (!trade.date) errs.push('Date is required');
  if (!trade.symbol) errs.push('Symbol is required');
  if (!trade.side) errs.push('Side is required');
  if (!Number.isFinite(Number(trade.qty)) || Number(trade.qty) <= 0) errs.push('Qty must be > 0');
  if (!Number.isFinite(Number(trade.entry))) errs.push('Entry must be a valid number');
  if (!Number.isFinite(Number(trade.exit))) errs.push('Exit must be a valid number');
  if (!Number.isFinite(Number(trade.commission)) || Number(trade.commission) < 0) errs.push('Commission cannot be negative');
  if (String(trade.assetType || '') === 'options') {
    if (!trade.underlying) errs.push('Options trade requires underlying');
    if (!trade.expiry) errs.push('Options trade requires expiry');
    if (!Number.isFinite(Number(trade.strike)) || Number(trade.strike) <= 0) errs.push('Options trade requires valid strike');
    if (!['CALL', 'PUT'].includes(String(trade.optionType || '').toUpperCase())) errs.push('Options trade requires option type (CALL/PUT)');
  }

  const duplicate = allTrades.find(t => t.id === trade.id && t.id !== state.editTradeId);
  if (duplicate) errs.push(`Duplicate trade ID detected: ${trade.id}`);
  return errs;
}

function renderTradeForm() {
  const host = document.querySelector('#trade-form');
  if (!host) return;
  host.innerHTML = `
    <div class="field"><label>Date</label><input name="date" type="date" required /></div>
    <div class="field"><label>Entry Time</label><input name="entryTime" type="time" /></div>
    <div class="field"><label>Asset Type</label><select name="assetType"><option value="futures">Futures</option><option value="options">Options</option><option value="stock">Stock</option></select></div>
    <div class="field"><label>Symbol</label><input name="symbol" placeholder="MNQH6 or AAPL" required /></div>
    <div class="field"><label>Underlying</label><input name="underlying" placeholder="NQ / SPY / AAPL" /></div>
    <div class="field"><label>Side</label><select name="side"><option>Long</option><option>Short</option></select></div>
    <div class="field"><label>Setup</label><input name="setup" placeholder="Pullback" /></div>
    <div class="field"><label>Strategy</label><input name="strategy" placeholder="Covered Call / BOS Hybrid" /></div>
    <div class="field"><label>Qty</label><input name="qty" type="number" step="1" value="1" /></div>
    <div class="field"><label>Contracts (options)</label><input name="contracts" type="number" step="1" value="" /></div>
    <div class="field"><label>Expiry (options)</label><input name="expiry" type="date" /></div>
    <div class="field"><label>Strike (options)</label><input name="strike" type="number" step="0.01" /></div>
    <div class="field"><label>Option Type</label><select name="optionType"><option value="">—</option><option value="CALL">CALL</option><option value="PUT">PUT</option></select></div>
    <div class="field"><label>Entry</label><input name="entry" type="number" step="0.01" /></div>
    <div class="field"><label>Exit</label><input name="exit" type="number" step="0.01" /></div>
    <div class="field"><label>P&L (Gross)</label><input name="pnl" type="number" step="0.01" /></div>
    <div class="field"><label>Commission</label><input name="commission" type="number" step="0.01" value="0" /></div>
    <div class="field"><label>R</label><input name="r" type="number" step="0.01" /></div>
    <div class="field"><label>Tags (comma)</label><input name="tags" placeholder="discipline, A+" /></div>
    <div class="field full"><label>Notes</label><textarea name="notes" rows="2" placeholder="Execution notes"></textarea></div>
    <div class="full" style="display:flex; gap:8px;">
      <button class="btn primary" type="submit">Save Trade</button>
      <button class="btn" type="button" id="cancel-edit" style="display:none;">Cancel Edit</button>
      <button class="btn" type="button" id="clear-local-trades">Clear Local Trades</button>
    </div>
    <div id="trade-form-errors" class="full small" style="margin-top:6px;"></div>
  `;

  host.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(host);
    const entry = Number(fd.get('entry') || 0);
    const exit = Number(fd.get('exit') || 0);
    const side = String(fd.get('side') || 'Long');
    let pnl = fd.get('pnl') ? Number(fd.get('pnl')) : (side === 'Long' ? (exit - entry) : (entry - exit));
    if (!Number.isFinite(pnl)) pnl = 0;
    const commission = Number(fd.get('commission') || 0);

    const tradeDate = String(fd.get('date') || new Date().toISOString().slice(0, 10));
    const entryTime = String(fd.get('entryTime') || '').trim();
    let entryTimestamp = '';
    if (entryTime) {
      const d = new Date(`${tradeDate}T${entryTime}`);
      if (!Number.isNaN(d.getTime())) entryTimestamp = d.toISOString();
    }

    const trade = normalizeTradeSchema({
      id: state.editTradeId || `MAN-${Date.now()}`,
      date: tradeDate,
      entryTime,
      entryTimestamp,
      assetType: String(fd.get('assetType') || 'futures').toLowerCase(),
      symbol: String(fd.get('symbol') || '').toUpperCase(),
      underlying: String(fd.get('underlying') || '').toUpperCase(),
      side,
      setup: String(fd.get('setup') || 'Manual'),
      strategy: String(fd.get('strategy') || ''),
      qty: Number(fd.get('qty') || 1),
      contracts: Number(fd.get('contracts') || 0),
      expiry: String(fd.get('expiry') || ''),
      strike: Number(fd.get('strike') || 0),
      optionType: String(fd.get('optionType') || '').toUpperCase(),
      entry,
      exit,
      pnl,
      commission: Number.isFinite(commission) ? commission : 0,
      r: Number(fd.get('r') || 0),
      tags: String(fd.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean),
      notes: String(fd.get('notes') || '')
    });

    const errs = validateTradeInput(trade, state.data.trades || []);
    const errHost = host.querySelector('#trade-form-errors');
    if (errs.length) {
      if (errHost) errHost.innerHTML = `<span class="neg">${errs.join(' • ')}</span>`;
      return;
    }

    const i = (state.data.trades || []).findIndex(t => t.id === trade.id);
    if (i >= 0) state.data.trades[i] = trade;
    else state.data.trades.push(trade);

    state.editTradeId = null;
    syncLocalTradesFromState();
    host.reset();
    if (errHost) errHost.innerHTML = '<span class="pos">Saved.</span>';
    const submit = host.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Save Trade';
    const cancelBtn = host.querySelector('#cancel-edit');
    if (cancelBtn) cancelBtn.style.display = 'none';
    rerender();
  });

  document.querySelector('#cancel-edit')?.addEventListener('click', () => {
    state.editTradeId = null;
    host.reset();
    const errHost = host.querySelector('#trade-form-errors');
    if (errHost) errHost.innerHTML = '';
    const submit = host.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Save Trade';
    const cancelBtn = host.querySelector('#cancel-edit');
    if (cancelBtn) cancelBtn.style.display = 'none';
  });

  document.querySelector('#clear-local-trades')?.addEventListener('click', () => {
    localStorage.removeItem(LOCAL_TRADES_KEY);
    state.data.trades = (state.data.trades || []).filter(t => !isLocalTrade(t));
    state.editTradeId = null;
    rerender();
  });
}

function renderTradesTable(selector, trades, clickable = false) {
  const host = document.querySelector(selector);
  if (!host) return;

  host.innerHTML = `
    <div class="table-wrap panel">
      <table>
        <thead>
          <tr><th>Date</th><th>Time</th><th>ID</th><th>Type</th><th>Symbol</th><th>Side</th><th>Setup</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Comm</th><th>Net P&L</th><th>R</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${trades.map(t => `
            <tr data-id="${t.id}" style="cursor:${clickable ? 'pointer' : 'default'}">
              <td>${t.date || ''}</td>
              <td>${deriveEntryTime(t) || '—'}</td>
              <td>${t.id || ''}</td>
              <td>${t.assetType || ''}</td>
              <td>${t.symbol || ''}</td>
              <td><span class="badge ${(t.side || '').toLowerCase()}">${t.side || ''}</span></td>
              <td>${t.setup || ''}</td>
              <td>${fmtNum(t.qty)}</td>
              <td>${fmtNum(t.entry)}</td>
              <td>${fmtNum(t.exit)}</td>
              <td>${fmtMoney(effectiveCommission(t) * -1)}</td>
              <td class="${netPnl(t) >= 0 ? 'pos' : 'neg'}">${fmtMoney(netPnl(t))}</td>
              <td>${Number(t.r || 0).toFixed(2)}</td>
              <td>
                ${isLocalTrade(t) ? `<button class="btn row-edit" data-id="${t.id}" type="button">Edit</button> <button class="btn row-delete" data-id="${t.id}" type="button">Delete</button>` : '<span class="muted small">Locked</span>'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${trades.length ? '' : '<div class="muted small" style="padding:10px 0 2px">No trades match current filters.</div>'}
    </div>
  `;

  if (clickable) {
    host.querySelectorAll('tr[data-id]').forEach(row => row.addEventListener('click', (e) => {
      if (e.target.closest('.row-edit') || e.target.closest('.row-delete')) return;
      state.selectedTrade = trades.find(t => t.id === row.dataset.id) || null;
      renderTradeDetail('#trade-detail', state.selectedTrade);
    }));
  }

  host.querySelectorAll('.row-edit').forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const trade = (state.data?.trades || []).find(t => t.id === id);
    if (!trade) return;
    state.editTradeId = id;
    fillFormForEdit(trade);
    const cancelBtn = document.querySelector('#cancel-edit');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  host.querySelectorAll('.row-delete').forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    state.data.trades = (state.data?.trades || []).filter(t => t.id !== id);
    if (state.selectedTrade?.id === id) state.selectedTrade = null;
    if (state.editTradeId === id) state.editTradeId = null;
    syncLocalTradesFromState();
    rerender();
  }));
}

function renderTradeDetail(selector, trade) {
  const host = document.querySelector(selector);
  if (!host) return;

  if (!trade) {
    host.innerHTML = `<div class="panel detail-box"><div class="muted">Select a trade row to inspect execution details, tags, and notes.</div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="panel detail-box">
      <h3 style="margin:0 0 6px">${trade.symbol || '—'} • ${trade.side || '—'}</h3>
      <div class="small muted">${trade.id || '—'} • ${trade.date || '—'} ${deriveEntryTime(trade) ? `@ ${deriveEntryTime(trade)}` : ''} • ${trade.setup || '—'}</div>
      ${trade.assetType === 'options' ? `<div class="small muted" style="margin-top:4px;">Options: ${trade.underlying || '—'} ${trade.expiry || '—'} ${trade.strike || '—'} ${trade.optionType || '—'} • contracts ${trade.contracts || trade.qty || 0}</div>` : ''}
      <div class="meta-grid">
        <div><div class="muted small">Entry</div><div>${fmtNum(trade.entry)}</div></div>
        <div><div class="muted small">Exit</div><div>${fmtNum(trade.exit)}</div></div>
        <div><div class="muted small">Qty</div><div>${fmtNum(trade.qty)}</div></div>
        <div><div class="muted small">R Multiple</div><div>${Number(trade.r || 0).toFixed(2)}R</div></div>
        <div><div class="muted small">Gross P&L</div><div class="${Number(trade.pnl || 0) >= 0 ? 'pos' : 'neg'}">${fmtMoney(trade.pnl)}</div></div>
        <div><div class="muted small">Commission</div><div>${fmtMoney(effectiveCommission(trade) * -1)}</div></div>
        <div><div class="muted small">Net P&L</div><div class="${netPnl(trade) >= 0 ? 'pos' : 'neg'}">${fmtMoney(netPnl(trade))}</div></div>
      </div>
      <div class="muted small">Tags</div>
      <div class="tag-row">${(trade.tags || []).length ? (trade.tags || []).map(tag => `<span class="badge">${tag}</span>`).join('') : '<span class="muted small">No tags</span>'}</div>
      <div class="muted small" style="margin-top:10px">Notes</div>
      <div>${trade.notes || '—'}</div>
    </div>
  `;
}

function normalizeJournalContent(text = '') {
  if (!text) return '—';
  const raw = String(text).trim();
  if (!raw) return '—';
  if (raw.startsWith('|')) {
    return raw
      .split('\n')
      .filter(line => line && !/^\|[-\s|]+\|$/.test(line.trim()))
      .map(line => line.replace(/^\||\|$/g, '').split('|').map(x => x.trim()).filter(Boolean).join(' — '))
      .join('\n');
  }
  return raw;
}

function renderDetailedJournalEntry(j) {
  const hasStructured = j.setupContext || j.execution || j.psychology || j.ruleAdherence || j.whatWentWell || j.whatToImprove || j.lessonLearned || j.nextRule;
  if (!hasStructured) {
    return `
      <p><strong class="muted">Mood:</strong> ${j.mood || '—'}</p>
      <p style="margin-top:8px; white-space: pre-line">${normalizeJournalContent(j.content)}</p>
    `;
  }

  return `
    <p><strong class="muted">Mood:</strong> ${j.mood || '—'}</p>
    <p><strong class="muted">Recovery Metrics:</strong> ${j.ouraSleepScore != null ? `Sleep ${j.ouraSleepScore}` : '—'}${j.ouraReadinessScore != null ? ` | Readiness ${j.ouraReadinessScore}` : ''}</p>
    <p><strong class="muted">Setup Context:</strong> ${j.setupContext || '—'}</p>
    <p><strong class="muted">Execution:</strong> ${j.execution || '—'}</p>
    <p><strong class="muted">Psychology:</strong> ${j.psychology || '—'}</p>
    <p><strong class="muted">Rule Adherence:</strong> ${j.ruleAdherence || '—'}</p>
    <p><strong class="muted">What I Did Good:</strong> ${j.whatWentWell || '—'}</p>
    <p><strong class="muted">What To Improve:</strong> ${j.whatToImprove || '—'}</p>
    <p><strong class="muted">Lesson Learned:</strong> ${j.lessonLearned || '—'}</p>
    <p><strong class="muted">Next Trade Rule:</strong> ${j.nextRule || '—'}</p>
    ${j.content ? `<p style="margin-top:8px; white-space: pre-line">${normalizeJournalContent(j.content)}</p>` : ''}
  `;
}

function renderAutoTradeLessons(trades) {
  if (!trades.length) return '';
  const latest = [...trades]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  return latest.map(t => {
    const lesson = t.lessonLearned || (netPnl(t) < 0
      ? 'Respect invalidation and protect capital faster.'
      : 'Repeat this execution discipline next setup.');
    const nextRule = t.nextRule || (netPnl(t) < 0
      ? 'No stop in market = no trade.'
      : 'Let winners resolve at TP/BE, no emotional exits.');

    return `
      <article class="note-item">
        <h4>${t.date || '—'} — Trade Review (${t.symbol || ''} ${t.side || ''})</h4>
        <p><strong class="muted">Execution:</strong> Entry ${fmtNum(t.entry)} / Exit ${fmtNum(t.exit)} / Net ${fmtMoney(netPnl(t))}</p>
        <p><strong class="muted">Lesson Learned:</strong> ${lesson}</p>
        <p><strong class="muted">Next Trade Rule:</strong> ${nextRule}</p>
      </article>
    `;
  }).join('');
}

function renderJournal(selector) {
  const host = document.querySelector(selector);
  if (!host) return;

  const entries = (state.data?.journal || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const journalHtml = entries.length
    ? entries.map(j => `
      <article class="note-item">
        <h4>${j.date || '—'} — ${j.title || 'Journal Entry'}</h4>
        ${renderDetailedJournalEntry(j)}
      </article>
    `).join('')
    : '<div class="panel muted">No journal entries found in local JSON.</div>';

  const autoLessons = renderAutoTradeLessons(getTrades());
  host.innerHTML = journalHtml + (autoLessons ? `<div style="margin-top:10px;"><h3 style="margin:0 0 8px;">Recent Trade Lessons</h3>${autoLessons}</div>` : '');
}

function sortReportRows(rows) {
  const mode = state.reportFilters.sortBy || 'pnl';
  const sorted = [...(rows || [])];
  if (mode === 'winRate') return sorted.sort((a, b) => b.winRate - a.winRate);
  if (mode === 'trades') return sorted.sort((a, b) => b.trades - a.trades);
  return sorted.sort((a, b) => b.pnl - a.pnl);
}

function renderMiniReportTable(selector, rows) {
  const host = document.querySelector(selector);
  if (!host) return;
  if (!rows?.length) {
    host.innerHTML = '<div class="panel muted">No data yet.</div>';
    return;
  }
  const top = sortReportRows(rows).slice(0, 8);
  host.innerHTML = `
    <div class="panel table-wrap">
      <table>
        <thead><tr><th>Group</th><th>Trades</th><th>Win%</th><th>Net</th></tr></thead>
        <tbody>
          ${top.map(r => `<tr><td>${r.key}</td><td>${r.trades}</td><td>${r.winRate.toFixed(1)}%</td><td class="${r.pnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(r.pnl)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReportsHighlights(selector, snapshot) {
  const host = document.querySelector(selector);
  if (!host) return;
  const top3 = [...(snapshot.bySetup || [])].sort((a, b) => b.pnl - a.pnl).slice(0, 3);
  const bottom3 = [...(snapshot.bySetup || [])].sort((a, b) => a.pnl - b.pnl).slice(0, 3);
  host.innerHTML = `
    <div class="panel">
      <div class="small muted" style="margin-bottom:6px;">Top 3 Setups</div>
      <ul class="list-compact">
        ${top3.length ? top3.map(x => `<li>${x.key} — <span class="pos">${fmtMoney(x.pnl)}</span></li>`).join('') : '<li>N/A</li>'}
      </ul>
      <div class="small muted" style="margin:10px 0 6px;">Bottom 3 Setups</div>
      <ul class="list-compact">
        ${bottom3.length ? bottom3.map(x => `<li>${x.key} — <span class="neg">${fmtMoney(x.pnl)}</span></li>`).join('') : '<li>N/A</li>'}
      </ul>
    </div>
  `;
}

function renderReportsSanity(selector, trades, snapshot) {
  const host = document.querySelector(selector);
  if (!host) return;
  const totalFromSetups = (snapshot.bySetup || []).reduce((s, r) => s + Number(r.pnl || 0), 0);
  const totalFromSymbols = (snapshot.bySymbol || []).reduce((s, r) => s + Number(r.pnl || 0), 0);
  const totalFromTrades = trades.reduce((s, t) => s + netPnl(t), 0);
  const ok = Math.abs(totalFromTrades - totalFromSetups) < 0.001 && Math.abs(totalFromTrades - totalFromSymbols) < 0.001;
  host.innerHTML = `
    <div class="panel">
      <div class="small muted">Trades total</div><div class="kpi-value ${totalFromTrades >= 0 ? 'pos' : 'neg'}">${fmtMoney(totalFromTrades)}</div>
      <div class="small muted" style="margin-top:8px;">Setup aggregate: ${fmtMoney(totalFromSetups)}</div>
      <div class="small muted">Symbol aggregate: ${fmtMoney(totalFromSymbols)}</div>
      <div class="small" style="margin-top:8px;color:${ok ? 'var(--success)' : 'var(--danger)'};">${ok ? '✓ aggregates reconcile' : '⚠ mismatch detected'}</div>
    </div>
  `;
}

function renderReportHealth(selector, trades) {
  const host = document.querySelector(selector);
  if (!host) return;
  const missingTime = trades.filter(t => !deriveEntryTime(t)).length;
  const untagged = trades.filter(t => !(Array.isArray(t.tags) && t.tags.length)).length;
  const zeroCommission = trades.filter(t => Number(t.commission || 0) <= 0).length;
  const badQty = trades.filter(t => !Number.isFinite(Number(t.qty)) || Number(t.qty) <= 0).length;
  host.innerHTML = `
    <div class="panel">
      <ul class="list-compact">
        <li>Missing time: <strong>${missingTime}</strong></li>
        <li>Untagged trades: <strong>${untagged}</strong></li>
        <li>Zero/empty commission: <strong>${zeroCommission}</strong></li>
        <li>Invalid qty records: <strong>${badQty}</strong></li>
      </ul>
    </div>
  `;
}

function renderReportsPage(trades) {
  if (!document.querySelector('#reports-kpis')) return;
  renderReportControls('#report-controls');
  const reportTrades = getReportTrades(trades);
  const snapshot = buildReportsSnapshot(reportTrades, state.data?.journal || []);
  window.__reports = snapshot;

  const k = snapshot.totals;
  const kpiHost = document.querySelector('#reports-kpis');
  if (kpiHost) {
    kpiHost.innerHTML = `
      <div class="panel"><div class="kpi-label">Net P&L</div><div class="kpi-value ${k.totalPnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(k.totalPnl)}</div></div>
      <div class="panel"><div class="kpi-label">Trades</div><div class="kpi-value">${k.count}</div></div>
      <div class="panel"><div class="kpi-label">Win Rate</div><div class="kpi-value">${k.winRate.toFixed(1)}%</div></div>
      <div class="panel"><div class="kpi-label">Avg R</div><div class="kpi-value ${k.avgR >= 0 ? 'pos' : 'neg'}">${k.avgR.toFixed(2)}R</div></div>
      <div class="panel"><div class="kpi-label">Expectancy</div><div class="kpi-value ${k.expectancy >= 0 ? 'pos' : 'neg'}">${fmtMoney(k.expectancy)}</div></div>
      <div class="panel"><div class="kpi-label">Profit Factor</div><div class="kpi-value">${Number.isFinite(k.profitFactor) ? k.profitFactor.toFixed(2) : '∞'}</div></div>
    `;
  }

  renderReportsHighlights('#report-highlights', snapshot);
  renderReportsSanity('#report-sanity', reportTrades, snapshot);
  renderReportHealth('#report-health', reportTrades);
  renderMiniReportTable('#report-setup', snapshot.bySetup);
  renderMiniReportTable('#report-time', snapshot.byTimeBucket);
  renderMiniReportTable('#report-symbol', snapshot.bySymbol);
  renderMiniReportTable('#report-recovery', snapshot.byRecovery);
  renderMiniReportTable('#report-tags', snapshot.byTag);
  renderWeekdayBars('#report-weekday', snapshot.byWeekday);
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);
  const btn = document.querySelector('#theme-toggle');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
}

function initThemeToggle() {
  let theme = 'light';
  try {
    theme = localStorage.getItem(THEME_KEY) || 'light';
  } catch (_) {}
  applyTheme(theme);

  const btn = document.querySelector('#theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  });
}

function markActiveNav() {
  const p = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(a => {
    if (a.getAttribute('href') === p) a.classList.add('active');
  });
}

function rerender() {
  const trades = getTrades();
  const futuresOnly = trades.filter(t => String(t.assetType || inferAssetType(t.symbol)).toLowerCase() === 'futures');
  const optionsOnly = trades.filter(t => String(t.assetType || inferAssetType(t.symbol)).toLowerCase() === 'options');

  if (document.querySelector('#kpis-futures')) renderKpis('#kpis-futures', futuresOnly);
  if (document.querySelector('#kpis-options')) renderKpis('#kpis-options', optionsOnly);
  if (document.querySelector('#kpis')) renderKpis('#kpis', trades);

  if (document.querySelector('#dashboard-breakdown')) renderDashboardBreakdown(trades, '#dashboard-breakdown');
  if (document.querySelector('#dashboard-breakdown-futures')) renderDashboardBreakdown(futuresOnly, '#dashboard-breakdown-futures');
  if (document.querySelector('#dashboard-breakdown-options')) renderDashboardBreakdown(optionsOnly, '#dashboard-breakdown-options');

  if (document.querySelector('#equity-curve')) renderEquityCurve(futuresOnly, '#equity-curve');
  if (document.querySelector('#equity-curve-options')) renderEquityCurve(optionsOnly, '#equity-curve-options');
  if (document.querySelector('#daily-heatmap-futures')) renderDailyHeatmap(futuresOnly, '#daily-heatmap-futures');
  if (document.querySelector('#daily-heatmap-options')) renderDailyHeatmap(optionsOnly, '#daily-heatmap-options');
  if (document.querySelector('#daily-heatmap')) renderDailyHeatmap(trades, '#daily-heatmap');

  if (document.querySelector('#filters')) renderFilterControls();
  if (document.querySelector('#data-ops')) renderDataOps();
  if (document.querySelector('#trade-form') && !state.formMounted) {
    renderTradeForm();
    state.formMounted = true;
  }
  if (document.querySelector('#trades-table')) renderTradesTable('#trades-table', trades, true);
  if (document.querySelector('#strategy-analytics')) renderStrategyAnalytics(trades);
  if (document.querySelector('#dashboard-table')) renderTradesTable('#dashboard-table', trades.slice(0, 8));
  if (document.querySelector('#dashboard-table-futures')) renderTradesTable('#dashboard-table-futures', futuresOnly.slice(0, 8));
  if (document.querySelector('#dashboard-table-options')) renderTradesTable('#dashboard-table-options', optionsOnly.slice(0, 8));

  if (state.selectedTrade) {
    const latest = trades.find(t => t.id === state.selectedTrade.id);
    state.selectedTrade = latest || null;
  }
  if (document.querySelector('#trade-detail')) renderTradeDetail('#trade-detail', state.selectedTrade);
  if (document.querySelector('#journal-list')) renderJournal('#journal-list');
  renderReportsPage(trades);
}

(async function init() {
  markActiveNav();
  initThemeToggle();
  loadCommissionSetting();
  state.data = await loadData();
  rerender();
})();
