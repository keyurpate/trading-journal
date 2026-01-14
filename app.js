// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let polygonApiKey = localStorage.getItem('polygonApiKey') || '';
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let currentAccountFilter = 'all';
let currentPlaybookFilter = 'all';

const INSTRUMENT_MULTIPLIERS = [
    { pattern: 'MES', multiplier: 5 }, { pattern: 'MNQ', multiplier: 2 },
    { pattern: 'MYM', multiplier: 0.5 }, { pattern: 'M2K', multiplier: 5 },
    { pattern: 'ES', multiplier: 50 }, { pattern: 'NQ', multiplier: 20 },
    { pattern: 'YM', multiplier: 5 }, { pattern: 'CL', multiplier: 1000 },
    { pattern: 'GC', multiplier: 100 }
];

let customPlaybooks = JSON.parse(localStorage.getItem('customPlaybooks')) || ['9 EMA Trend', 'Breakout', 'Support/Resistance', 'VWAP Bounce', 'Other'];

// P&L CALCULATION (Includes $1.00 Commission per Contract)
function calculatePnLFromTrade(trade) {
    const s = trade.symbol.toUpperCase();
    let multiplier = 1;
    for (const item of INSTRUMENT_MULTIPLIERS) {
        if (s.includes(item.pattern)) { multiplier = item.multiplier; break; }
    }

    const pointDiff = trade.exitPrice - trade.entryPrice;
    const quantity = parseFloat(trade.quantity) || 0;
    
    // Commission: $0.50 per contract for entry + $0.50 for exit = $1.00 total
    const totalCommission = quantity * 1.00;
    
    let grossPnL = (trade.tradeType === 'long') ? (pointDiff * multiplier * quantity) : (-pointDiff * multiplier * quantity);
    return grossPnL - totalCommission;
}

// TAG PERFORMANCE (Sorted by Profit)
function renderTagStats() {
    const stats = {};
    trades.forEach(t => {
        const allTags = [...(t.tags || []), ...(t.mistakes || []).map(m => `⚠️ ${m}`)];
        allTags.forEach(tag => {
            if (!stats[tag]) stats[tag] = { name: tag, pnl: 0, count: 0, wins: 0 };
            stats[tag].pnl += t.pnl;
            stats[tag].count++;
            if (t.pnl > 0) stats[tag].wins++;
        });
    });

    const sortedTags = Object.values(stats).sort((a, b) => b.pnl - a.pnl);
    if (sortedTags.length === 0) return '';

    let html = '<div class="playbook-stats-section"><h2>🏷️ Tag Performance (Sorted by Profit)</h2><div class="playbook-stats-grid">';
    sortedTags.forEach(s => {
        html += `<div class="playbook-stat-card" style="border-left: 5px solid ${s.pnl >= 0 ? '#10b981' : '#ef4444'}">
            <h3>${s.name}</h3>
            <div class="stat-row"><span>Trades:</span><span class="stat-value">${s.count}</span></div>
            <div class="stat-row"><span>Net P&L:</span><span class="stat-value ${s.pnl >= 0 ? 'profit' : 'loss'}">$${s.pnl.toFixed(2)}</span></div>
        </div>`;
    });
    return html + '</div></div>';
}

// SCALING FIX: Groups multiple orders into one trade
function importCsv() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const lines = e.target.result.split('\n');
        const orders = [];
        for (let i = 1; i < lines.length; i++) {
            const v = lines[i].split(',');
            if (v.length < 5) continue;
            orders.push({ symbol: v[0], side: v[1].toLowerCase(), qty: Math.abs(parseInt(v[2])), price: parseFloat(v[3]), time: v[4], type: v[6], account: v[12] || 'Default' });
        }
        orders.reverse(); // Chronological

        let openPos = {};
        const parsedTrades = [];

        orders.forEach(o => {
            const key = `${o.symbol}-${o.account}`;
            if (o.type === 'Entry') {
                if (!openPos[key]) openPos[key] = { entries: [], exits: [], currentQty: 0 };
                openPos[key].entries.push(o);
                openPos[key].currentQty += o.qty;
            } else if (o.type === 'Exit' && openPos[key]) {
                openPos[key].exits.push(o);
                openPos[key].currentQty -= o.qty;
                if (openPos[key].currentQty <= 0) {
                    const p = openPos[key];
                    const tQty = p.entries.reduce((s, x) => s + x.qty, 0);
                    const avgIn = p.entries.reduce((s, x) => s + (x.price * x.qty), 0) / tQty;
                    const avgOut = p.exits.reduce((s, x) => s + (x.price * x.qty), 0) / p.exits.reduce((s, x) => s + x.qty, 0);
                    const trade = { id: Date.now() + Math.random(), symbol: o.symbol, tradeType: p.entries[0].side === 'buy' ? 'long' : 'short', entryPrice: avgIn, exitPrice: avgOut, entryDate: p.entries[0].time, exitDate: o.time, quantity: tQty, account: o.account, tags: [], mistakes: [], notes: '' };
                    trade.pnl = calculatePnLFromTrade(trade);
                    parsedTrades.push(trade);
                    delete openPos[key];
                }
            }
        });

        parsedTrades.forEach(nt => {
            if (!trades.some(t => t.symbol === nt.symbol && t.entryDate === nt.entryDate)) trades.push(nt);
        });

        localStorage.setItem('trades', JSON.stringify(trades));
        location.reload();
    };
    reader.readAsText(file);
}

// UI RENDERING
function loadTrades() {
    const container = document.getElementById('tradesContainer');
    let filtered = trades.filter(t => (currentAccountFilter === 'all' || t.account === currentAccountFilter) && (currentPlaybookFilter === 'all' || t.playbook === currentPlaybookFilter));

    let html = renderTagStats();
    html += '<div class="stats-section"><h2>📋 History</h2>';
    filtered.reverse().forEach(t => {
        html += `<div class="trade-card">
            <div class="trade-header">
                <div><div class="trade-symbol">${t.symbol} (${t.quantity} cons)</div><div style="font-size:12px; color:#64748b">${t.tradeType.toUpperCase()} | ${t.account}</div></div>
                <div class="trade-pnl ${t.pnl >= 0 ? 'profit' : 'loss'}">$${t.pnl.toFixed(2)}</div>
            </div>
            <div class="button-group"><button class="edit-btn" onclick="editTrade(${t.id})">✏️ Edit</button></div>
        </div>`;
    });
    container.innerHTML = html;
}

// ... (Rest of support functions: renderCalendar, editTrade, etc.)
// Include your existing setupEventListeners, renderCalendar logic here or keep the app running.
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('importCsvButton').addEventListener('click', importCsv);
    renderCalendar();
    loadTrades();
});

function renderCalendar() { /* Same as your old logic */ }
function editTrade(id) { /* Same as your old logic */ }
