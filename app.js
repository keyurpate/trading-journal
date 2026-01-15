// ===== CONFIG =====
const COMMISSION_PER_CONTRACT_ROUNDTRIP = 1.0; // $1 per contract (0.5 entry + 0.5 exit)

// ===== STATE =====
let trades = [];

// ===== HELPERS =====
function calculateTradePnL(trade) {
  const direction = trade.side === "Long" ? 1 : -1;

  // Weighted average entry (handles scale-in)
  let totalEntryQty = 0;
  let totalEntryValue = 0;

  trade.entries.forEach(e => {
    totalEntryQty += e.qty;
    totalEntryValue += e.price * e.qty;
  });

  const avgEntry = totalEntryValue / totalEntryQty;

  // Exits (handles partial exits)
  let grossPnL = 0;
  let totalExitQty = 0;

  trade.exits.forEach(x => {
    totalExitQty += x.qty;
    grossPnL += (x.price - avgEntry) * x.qty * direction;
  });

  const contractsTraded = Math.max(totalEntryQty, totalExitQty);
  const commission = contractsTraded * COMMISSION_PER_CONTRACT_ROUNDTRIP;

  return {
    avgEntry,
    grossPnL,
    commission,
    netPnL: grossPnL - commission
  };
}

// ===== TAG PERFORMANCE =====
function buildTagStats(trades) {
  const stats = {};

  trades.forEach(trade => {
    const pnl = trade.pnl.netPnL;
    trade.tags.forEach(tag => {
      if (!stats[tag]) {
        stats[tag] = { pnl: 0, trades: 0 };
      }
      stats[tag].pnl += pnl;
      stats[tag].trades += 1;
    });
  });

  // Sort by profitability (best → worst)
  return Object.entries(stats).sort((a, b) => b[1].pnl - a[1].pnl);
}

// ===== CSV PARSER (SCALE-IN SAFE) =====
function parseCSV(rows) {
  const tradeMap = {};

  rows.forEach(r => {
    const id = r.tradeId;

    if (!tradeMap[id]) {
      tradeMap[id] = {
        id,
        side: r.side,
        tags: r.tags ? r.tags.split(",").map(t => t.trim()) : [],
        entries: [],
        exits: []
      };
    }

    if (r.type === "Entry") {
      tradeMap[id].entries.push({
        price: Number(r.price),
        qty: Number(r.qty)
      });
    }

    if (r.type === "Exit") {
      tradeMap[id].exits.push({
        price: Number(r.price),
        qty: Number(r.qty)
      });
    }
  });

  trades = Object.values(tradeMap).map(t => {
    t.pnl = calculateTradePnL(t);
    return t;
  });

  renderTagStats();
}

// ===== UI =====
function renderTagStats() {
  const container = document.getElementById("tagStats");
  container.innerHTML = "";

  const stats = buildTagStats(trades);

  stats.forEach(([tag, data]) => {
    const div = document.createElement("div");
    div.className = "tag-card";
    div.innerHTML = `
      <strong>${tag}</strong>
      <div>P&L: $${data.pnl.toFixed(2)}</div>
      <div>Trades: ${data.trades}</div>
    `;
    container.appendChild(div);
  });
}

