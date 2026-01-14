let trades = JSON.parse(localStorage.getItem('trades')) || [];
let customPlaybooks = JSON.parse(localStorage.getItem('customPlaybooks')) || ['Trend Follow', 'Reversal', 'Scalp'];

const COMMISSION_PER_CONTRACT = 1.00;

// Multiplier configuration
const MULTIPLIERS = [
    { pattern: 'MES', value: 5 },
    { pattern: 'MNQ', value: 2 },
    { pattern: 'ES', value: 50 },
    { pattern: 'NQ', value: 20 }
];

function getMultiplier(symbol) {
    const found = MULTIPLIERS.find(m => symbol.toUpperCase().includes(m.pattern));
    return found ? found.value : 1;
}

function calculateTradeNet(trade) {
    const mult = getMultiplier(trade.symbol);
    const diff = trade.exitPrice - trade.entryPrice;
    const gross = (trade.type === 'long' ? diff : -diff) * mult * trade.quantity;
    const comms = trade.quantity * COMMISSION_PER_CONTRACT;
    return gross - comms;
}

// Improved CSV Import for Scaling Positions
function importCsv() {
    const file = document.getElementById('csvFileInput').files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const lines = e.target.result.split('\n').filter(l => l.trim());
        const raw = lines.slice(1).map(line => {
            const v = line.split(',');
            return { symbol: v[0], side: v[1], qty: parseInt(v[2]), price: parseFloat(v[3]), time: v[4], action: v[6], acc: v[12] };
        }).sort((a,b) => new Date(a.time) - new Date(b.time));

        const newTrades = [];
        let openPos = null;

        raw.forEach(order => {
            if (!openPos) {
                openPos = { 
                    symbol: order.symbol, type: order.side.toLowerCase().includes('buy') ? 'long' : 'short',
                    entries: [{p: order.price, q: order.qty}], exits: [], 
                    qtyLeft: order.qty, start: order.time, acc: order.acc 
                };
            } else if (order.symbol === openPos.symbol && order.action === 'Entry') {
                openPos.entries.push({p: order.price, q: order.qty});
                openPos.qtyLeft += order.qty;
            } else if (order.symbol === openPos.symbol && order.action === 'Exit') {
                openPos.exits.push({p: order.price, q: order.qty});
                openPos.qtyLeft -= order.qty;
                if (openPos.qtyLeft <= 0) {
                    const totalQty = openPos.entries.reduce((s,e) => s + e.q, 0);
                    const avgEntry = openPos.entries.reduce((s,e) => s + (e.p*e.q), 0) / totalQty;
                    const avgExit = openPos.exits.reduce((s,e) => s + (e.p*e.q), 0) / totalQty;
                    const t = { 
                        id: Date.now() + Math.random(), symbol: openPos.symbol, type: openPos.type,
                        entryPrice: avgEntry, exitPrice: avgExit, quantity: totalQty,
                        entryDate: openPos.start, exitDate: order.time, account: openPos.acc,
                        tags: [], playbook: '' 
                    };
                    t.pnl = calculateTradeNet(t);
                    newTrades.push(t);
                    openPos = null;
                }
            }
        });

        trades = [...trades, ...newTrades.filter(nt => !trades.some(et => et.entryDate === nt.entryDate))];
        localStorage.setItem('trades', JSON.stringify(trades));
        render();
    };
    reader.readAsText(file);
}

function renderTagStats() {
    const stats = {};
    trades.forEach(t => {
        (t.tags || []).forEach(tag => {
            if (!stats[tag]) stats[tag] = { pnl: 0, count: 0 };
            stats[tag].pnl += t.pnl;
            stats[tag].count++;
        });
    });

    const sorted = Object.entries(stats).sort((a,b) => b[1].pnl - a[1].pnl);
    let html = '<h2>🏷️ Profit by Tag</h2><div class="stats-grid">';
    sorted.forEach(([tag, data]) => {
        html += `<div class="stat-card">
            <h3>${tag}</h3>
            <div class="stat-value ${data.pnl >= 0 ? 'profit' : 'loss'}">$${data.pnl.toFixed(2)}</div>
            <div style="font-size:12px; color:#64748b">${data.count} trades</div>
        </div>`;
    });
    return html + '</div>';
}

function render() {
    const container = document.getElementById('tradesContainer');
    const statsDiv = document.getElementById('statsContainer');
    
    statsDiv.innerHTML = renderTagStats();
    
    let html = '<h2>📋 Trade History</h2>';
    trades.sort((a,b) => new Date(b.entryDate) - new Date(a.entryDate)).forEach(t => {
        html += `<div class="trade-card">
            <div style="display:flex; justify-content:space-between">
                <div>
                    <strong>${t.symbol}</strong> (${t.type.toUpperCase()}) - ${t.account}
                    <div style="font-size:12px; color:#64748b">${t.entryDate}</div>
                </div>
                <div class="stat-value ${t.pnl >= 0 ? 'profit' : 'loss'}">$${t.pnl.toFixed(2)}</div>
            </div>
            <div style="margin-top:10px">
                ${(t.tags || []).map(tag => `<span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-size:11px; margin-right:5px">${tag}</span>`).join('')}
            </div>
            <button onclick="editTrade(${t.id})" style="background:none; color:var(--primary); font-size:12px; margin-top:10px">Edit Tags</button>
        </div>`;
    });
    container.innerHTML = html;
    renderCalendar();
}

// Calendar and UI Helpers
function renderCalendar() {
    const cal = document.getElementById('calendar');
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    document.getElementById('calendarTitle').innerText = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    let html = '';
    for(let d=1; d<=daysInMonth; d++) {
        const dayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayPnL = trades.filter(t => t.entryDate.includes(dayStr)).reduce((s,t) => s + t.pnl, 0);
        let cls = 'calendar-day';
        if(dayPnL > 0) cls += ' profit'; else if(dayPnL < 0) cls += ' loss';
        html += `<div class="${cls}"><b>${d}</b><span>${dayPnL !== 0 ? '$' + Math.round(dayPnL) : ''}</span></div>`;
    }
    cal.innerHTML = html;
}

let editingId = null;
window.editTrade = (id) => {
    editingId = id;
    const t = trades.find(x => x.id === id);
    document.getElementById('editTags').value = (t.tags || []).join(', ');
    document.getElementById('editNotes').value = t.notes || '';
    document.getElementById('editTradeModal').style.display = 'block';
};

document.getElementById('saveTradeBtn').onclick = () => {
    const t = trades.find(x => x.id === editingId);
    t.tags = document.getElementById('editTags').value.split(',').map(s => s.trim()).filter(s => s);
    t.notes = document.getElementById('editNotes').value;
    localStorage.setItem('trades', JSON.stringify(trades));
    document.getElementById('editTradeModal').style.display = 'none';
    render();
};

document.getElementById('importCsvButton').onclick = importCsv;
document.addEventListener('DOMContentLoaded', render);
