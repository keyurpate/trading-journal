/*******************************************************
 * Trading Journal - Enhanced
 * - Tag Performance sorted by PnL
 * - Commission support ($ per contract round trip)
 * - Scale-in / partial exits support (fix confusion)
 *******************************************************/

let trades = [];          // parsed trade objects
let filteredTrades = [];  // tag filtered view

// Default commission (round trip per contract)
let COMMISSION_PER_CONTRACT_ROUNDTRIP = 1.0;

// Elements
const csvInput = document.getElementById("csvInput");
const commissionInput = document.getElementById("commissionInput");
const tagFilter = document.getElementById("tagFilter");
const clearBtn = document.getElementById("clearBtn");

const tagStatsEl = document.getElementById("tagStats");
const tradesTbody = document.getElementById("tradesTbody");

// Stats elements
const totalTradesEl = document.getElementById("totalTrades");
const winRateEl = document.getElementById("winRate");
const totalPnlEl = document.getElementById("totalPnl");
const avgPnlEl = document.getElementById("avgPnl");
const largestWinEl = document.getElementById("largestWin");
const largestLossEl = document.getElementById("largestLoss");

// ===== Utils =====
function money(n) {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function clsPnl(v) {
  return v >= 0 ? "pnl-pos" : "pnl-neg";
}

function splitTags(s) {
  if (!s) return [];
  return String(s)
    .split(/[;,|]/g)
    .map(t => t.trim())
    .filter(Boolean);
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "");
}

// ===== CSV parsing (simple, works for most exports) =====
function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(","); // if your CSV has quoted commas, tell me and I’ll swap parser
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (cols[idx] ?? "").trim());
    rows.push(obj);
  }
  return rows;
}

/**
 * We support 2 shapes:
 * A) One row per fill with: TradeId + Type(Entry/Exit) + Qty + Price + Side + Tags + Date + Symbol
 * B) Already aggregated per trade. (We’ll still try best.)
 */
function mapRowsToTrades(rows) {
  // detect headers
  const sample = rows[0] || {};
  const keys = Object.keys(sample).map(normalizeHeader);

  const hasTradeId = keys.includes("tradeid") || keys.includes("id");
  const hasType = keys.includes("type") || keys.includes("action");
  const hasPrice = keys.includes("price") || keys.includes("fillprice") || keys.includes("avgprice");
  const hasQty = keys.includes("qty") || keys.includes("quantity") || keys.includes("contracts");
  const hasSide = keys.includes("side") || keys.includes("direction") || keys.includes("buy/sell");

  // helper to read field with multiple possible names
  const get = (row, names) => {
    for (const n of names) {
      const foundKey = Object.keys(row).find(k => normalizeHeader(k) === normalizeHeader(n));
      if (foundKey) return row[foundKey];
    }
    return "";
  };

  // if fill-style csv: build trade map by trade id
  if (hasTradeId && hasType && hasPrice && hasQty) {
    const map = {};

    rows.forEach(r => {
      const id = get(r, ["TradeId", "ID", "trade id", "tradeid"]).trim();
      if (!id) return;

      if (!map[id]) {
        map[id] = {
          id,
          date: get(r, ["Date", "date", "FilledTime", "Time", "Timestamp"]),
          symbol: get(r, ["Symbol", "Instrument", "Ticker"]),
          side: normalizeSide(get(r, ["Side", "Direction", "Buy/Sell", "Action"])) || "Long",
          tags: splitTags(get(r, ["Tags", "Tag", "Notes"])),
          entries: [],
          exits: []
        };
      }

      // Prefer row-level side if present
      const rowSide = normalizeSide(get(r, ["Side", "Direction", "Buy/Sell", "Action"]));
      if (rowSide) map[id].side = rowSide;

      // Tags: union across rows
      const rt = splitTags(get(r, ["Tags", "Tag", "Notes"]));
      rt.forEach(tg => {
        if (!map[id].tags.includes(tg)) map[id].tags.push(tg);
      });

      const t = String(get(r, ["Type", "type", "Action", "action"])).trim().toLowerCase();
      const price = Number(get(r, ["Price", "FillPrice", "AvgPrice", "price"])) || 0;
      const qty = Number(get(r, ["Qty", "Quantity", "Contracts"])) || 0;

      if (!qty || !price) return;

      // Determine entry/exit:
      // - if Type explicitly says Entry/Exit, use it
      // - else if action says Buy/Sell, infer based on trade side
      if (t.includes("entry")) {
        map[id].entries.push({ price, qty });
      } else if (t.includes("exit")) {
        map[id].exits.push({ price, qty });
      } else {
        // infer
        const act = String(get(r, ["Action", "Buy/Sell", "Side"])).toLowerCase();
        if (act.includes("buy")) {
          if (map[id].side === "Long") map[id].entries.push({ price, qty });
          else map[id].exits.push({ price, qty });
        } else if (act.includes("sell")) {
          if (map[id].side === "Long") map[id].exits.push({ price, qty });
          else map[id].entries.push({ price, qty });
        } else {
          // fallback: treat as entry if no exits yet
          if (map[id].exits.length === 0) map[id].entries.push({ price, qty });
          else map[id].exits.push({ price, qty });
        }
      }
    });

    // finalize
    return Object.values(map).map(t => finalizeTrade(t));
  }

  // fallback: assume aggregated trade rows
  return rows.map((r, idx) => {
    const t = {
      id: String(idx + 1),
      date: get(r, ["Date", "date", "Closed", "CloseTime", "Time"]),
      symbol: get(r, ["Symbol", "Instrument", "Ticker"]),
      side: normalizeSide(get(r, ["Side", "Direction"])) || "Long",
      tags: splitTags(get(r, ["Tags", "Tag", "Notes"])),
      entries: [{ price: Number(get(r, ["Entry", "EntryPrice", "BuyPrice"])) || 0, qty: Number(get(r, ["Qty", "Quantity", "Contracts"])) || 0 }],
      exits: [{ price: Number(get(r, ["Exit", "ExitPrice", "SellPrice"])) || 0, qty: Number(get(r, ["Qty", "Quantity", "Contracts"])) || 0 }]
    };
    return finalizeTrade(t);
  });
}

function normalizeSide(s) {
  const v = String(s || "").toLowerCase();
  if (!v) return "";
  if (v.includes("long") || v.includes("buy")) return "Long";
  if (v.includes("short") || v.includes("sell")) return "Short";
  return "";
}

// ===== PnL calc (scale-in safe) =====
function computePnl(trade) {
  const direction = trade.side === "Long" ? 1 : -1;

  let totalEntryQty = 0;
  let totalEntryValue = 0;

  trade.entries.forEach(e => {
    totalEntryQty += e.qty;
    totalEntryValue += e.price * e.qty;
  });

  // avoid divide by zero
  const avgEntry = totalEntryQty ? (totalEntryValue / totalEntryQty) : 0;

  let totalExitQty = 0;
  let grossPnL = 0;

  trade.exits.forEach(x => {
    totalExitQty += x.qty;
    grossPnL += (x.price - avgEntry) * x.qty * direction;
  });

  const contractsTraded = Math.max(totalEntryQty, totalExitQty);
  const commission = contractsTraded * COMMISSION_PER_CONTRACT_ROUNDTRIP;

  const netPnL = grossPnL - commission;

  // avg exit for display
  let avgExit = 0;
  if (trade.exits.length) {
    let v = 0, q = 0;
    trade.exits.forEach(x => { v += x.price * x.qty; q += x.qty; });
    avgExit = q ? v / q : 0;
  }

  return { avgEntry, avgExit, grossPnL, commission, netPnL, qty: contractsTraded };
}

function finalizeTrade(trade) {
  // If exits exceed entries due to odd csv, still compute safely
  trade.pnl = computePnl(trade);
  return trade;
}

// ===== Tag stats =====
function buildTagStats(tradesList) {
  const stats = {};

  tradesList.forEach(t => {
    const pnl = t.pnl.netPnL;
    const tags = t.tags.length ? t.tags : ["(no tag)"];

    tags.forEach(tag => {
      if (!stats[tag]) stats[tag] = { pnl: 0, trades: 0, wins: 0, losses: 0 };
      stats[tag].pnl += pnl;
      stats[tag].trades += 1;
      if (pnl >= 0) stats[tag].wins += 1;
      else stats[tag].losses += 1;
    });
  });

  return Object.entries(stats).sort((a, b) => b[1].pnl - a[1].pnl);
}

function renderTagStats() {
  tagStatsEl.innerHTML = "";
  const stats = buildTagStats(trades);

  if (!stats.length) {
    tagStatsEl.innerHTML = `<div class="tag-card"><strong>No tags yet</strong><div>Upload a CSV to see tag performance.</div></div>`;
    return;
  }

  stats.forEach(([tag, data]) => {
    const winRate = data.trades ? (data.wins / data.trades) * 100 : 0;

    const div = document.createElement("div");
    div.className = "tag-card";
    div.innerHTML = `
      <strong>${tag}</strong>
      <div class="${clsPnl(data.pnl)}">PnL: ${money(data.pnl)}</div>
      <div>Trades: ${data.trades}</div>
      <div>Win Rate: ${winRate.toFixed(0)}%</div>
    `;

    // click to filter by that tag
    div.style.cursor = "pointer";
    div.addEventListener("click", () => {
      tagFilter.value = tag === "(no tag)" ? "__no_tag__" : tag;
      applyFilters();
    });

    tagStatsEl.appendChild(div);
  });
}

// ===== Filters =====
function rebuildTagFilterOptions() {
  const allTags = new Set();
  trades.forEach(t => {
    if (!t.tags.length) allTags.add("__no_tag__");
    t.tags.forEach(tag => allTags.add(tag));
  });

  // keep first option (All)
  const keepFirst = tagFilter.querySelector("option[value='']");
  tagFilter.innerHTML = "";
  tagFilter.appendChild(keepFirst);

  [...allTags].sort((a, b) => a.localeCompare(b)).forEach(tag => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag === "__no_tag__" ? "(no tag)" : tag;
    tagFilter.appendChild(opt);
  });
}

function applyFilters() {
  const t = tagFilter.value;

  filteredTrades = trades.filter(tr => {
    if (!t) return true;
    if (t === "__no_tag__") return !tr.tags.length;
    return tr.tags.includes(t);
  });

  renderAll();
}

// ===== Render Trades =====
function renderTradesTable() {
  tradesTbody.innerHTML = "";

  filteredTrades.forEach(tr => {
    const pnl = tr.pnl.netPnL;
    const trEl = document.createElement("tr");

    const tagsStr = tr.tags.length ? tr.tags.join(", ") : "(no tag)";

    trEl.innerHTML = `
      <td>${tr.date || ""}</td>
      <td>${tr.symbol || ""}</td>
      <td>${tr.side}</td>
      <td>${tr.pnl.qty}</td>
      <td>${tr.pnl.avgEntry ? tr.pnl.avgEntry.toFixed(2) : ""}</td>
      <td>${tr.pnl.avgExit ? tr.pnl.avgExit.toFixed(2) : ""}</td>
      <td class="${clsPnl(tr.pnl.grossPnL)}">${money(tr.pnl.grossPnL)}</td>
      <td>${money(tr.pnl.commission)}</td>
      <td class="${clsPnl(pnl)}">${money(pnl)}</td>
      <td>${tagsStr}</td>
    `;

    tradesTbody.appendChild(trEl);
  });
}

function renderStats() {
  const list = filteredTrades;
  const totalTrades = list.length;

  let wins = 0;
  let totalPnL = 0;
  let largestWin = 0;
  let largestLoss = 0;

  list.forEach(t => {
    const p = t.pnl.netPnL;
    totalPnL += p;
    if (p >= 0) wins++;
    if (p > largestWin) largestWin = p;
    if (p < largestLoss) largestLoss = p;
  });

  const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
  const avgPnL = totalTrades ? totalPnL / totalTrades : 0;

  totalTradesEl.textContent = totalTrades;
  winRateEl.textContent = `${winRate.toFixed(0)}%`;
  totalPnlEl.textContent = money(totalPnL);
  avgPnlEl.textContent = money(avgPnL);
  largestWinEl.textContent = money(largestWin);
  largestLossEl.textContent = money(largestLoss);

  totalPnlEl.className = `stat-value ${clsPnl(totalPnL)}`;
  avgPnlEl.className = `stat-value ${clsPnl(avgPnL)}`;
  largestWinEl.className = `stat-value ${clsPnl(largestWin)}`;
  largestLossEl.className = `stat-value ${clsPnl(largestLoss)}`;
}

function renderAll() {
  renderTagStats();
  renderTradesTable();
  renderStats();
}

// ===== Events =====
commissionInput.addEventListener("input", () => {
  const v = Number(commissionInput.value);
  COMMISSION_PER_CONTRACT_ROUNDTRIP = isFinite(v) ? v : 1.0;

  // recompute pnl
  trades = trades.map(t => finalizeTrade(t));
  applyFilters();
});

tagFilter.addEventListener("change", applyFilters);

clearBtn.addEventListener("click", () => {
  trades = [];
  filteredTrades = [];
  tagFilter.value = "";
  rebuildTagFilterOptions();
  renderAll();
});

csvInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsvText(reader.result);
    trades = mapRowsToTrades(rows);
    filteredTrades = trades;

    rebuildTagFilterOptions();
    tagFilter.value = "";
    renderAll();
  };
  reader.readAsText(file);
});

// initial render
renderAll();
