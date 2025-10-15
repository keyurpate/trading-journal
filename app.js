// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let journalEntries = JSON.parse(localStorage.getItem('journal')) || [];
let pnlChart = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadDashboard();
    loadTrades();
    loadJournal();
});

// Tab switching
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'dashboard') {
        loadDashboard();
    } else if (tabName === 'trades') {
        loadTrades();
    } else if (tabName === 'journal') {
        loadJournal();
    }
}

// Show/Hide add trade form
function showAddTradeForm() {
    document.getElementById('addTradeForm').style.display = 'block';
}

function hideAddTradeForm() {
    document.getElementById('addTradeForm').style.display = 'none';
    document.querySelector('#addTradeForm form').reset();
}

// Add trade
function addTrade(event) {
    event.preventDefault();
    
    const symbol = document.getElementById('symbol').value;
    const tradeType = document.getElementById('tradeType').value;
    const entryPrice = parseFloat(document.getElementById('entryPrice').value);
    const exitPrice = parseFloat(document.getElementById('exitPrice').value);
    const entryDate = document.getElementById('entryDate').value;
    const exitDate = document.getElementById('exitDate').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const strategy = document.getElementById('strategy').value;
    const notes = document.getElementById('notes').value;
    
    // Calculate P&L
    let pnl;
    if (tradeType === 'long') {
        pnl = (exitPrice - entryPrice) * quantity;
    } else {
        pnl = (entryPrice - exitPrice) * quantity;
    }
    
    const trade = {
        id: Date.now(),
        symbol,
        tradeType,
        entryPrice,
        exitPrice,
        entryDate,
        exitDate,
        quantity,
        strategy,
        notes,
        pnl
    };
    
    trades.push(trade);
    localStorage.setItem('trades', JSON.stringify(trades));
    
    hideAddTradeForm();
    loadTrades();
    loadDashboard();
}

// Load trades
function loadTrades() {
    const tradesList = document.getElementById('tradesList');
    
    if (trades.length === 0) {
        tradesList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No trades yet. Click "Add Trade" to get started!</p>';
        return;
    }
    
    tradesList.innerHTML = trades.map(trade => `
        <div class="trade-card">
            <div class="trade-header">
                <div>
                    <div class="trade-symbol">${trade.symbol}</div>
                    <div style="color: #666; font-size: 14px;">${trade.tradeType.toUpperCase()}</div>
                </div>
                <div class="trade-pnl ${trade.pnl >= 0 ? 'profit' : 'loss'}">
                    ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
                </div>
            </div>
            <div class="trade-details">
                <div class="trade-detail">
                    Entry Price
                    <span>$${trade.entryPrice.toFixed(2)}</span>
                </div>
                <div class="trade-detail">
                    Exit Price
                    <span>$${trade.exitPrice.toFixed(2)}</span>
                </div>
                <div class="trade-detail">
                    Quantity
                    <span>${trade.quantity}</span>
                </div>
                <div class="trade-detail">
                    Strategy
                    <span>${trade.strategy || 'N/A'}</span>
                </div>
            </div>
            ${trade.notes ? `<div style="margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; color: #666; font-size: 14px;">${trade.notes}</div>` : ''}
            <div class="trade-actions">
                <button class="btn-small btn-view" onclick="viewTradeChart(${trade.id})">View Chart</button>
                <button class="btn-small btn-delete" onclick="deleteTrade(${trade.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

// Delete trade
function deleteTrade(id) {
    if (confirm('Are you sure you want to delete this trade?')) {
        trades = trades.filter(trade => trade.id !== id);
        localStorage.setItem('trades', JSON.stringify(trades));
        loadTrades();
        loadDashboard();
    }
}

// View trade chart
function viewTradeChart(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;
    
    alert(`Chart visualization for ${trade.symbol}\n\nEntry: $${trade.entryPrice} on ${new Date(trade.entryDate).toLocaleDateString()}\nExit: $${trade.exitPrice} on ${new Date(trade.exitDate).toLocaleDateString()}\nP&L: $${trade.pnl.toFixed(2)}\n\nNote: For full chart visualization with candlesticks, integrate with TradingView or similar charting library.`);
}

// Load dashboard
function loadDashboard() {
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgWinLoss = totalTrades > 0 ? (totalPnL / totalTrades).toFixed(2) : 0;
    
    document.getElementById('totalTrades').textContent = totalTrades;
    document.getElementById('winRate').textContent = winRate + '%';
    document.getElementById('totalPnL').textContent = '$' + totalPnL.toFixed(2);
    document.getElementById('totalPnL').style.color = totalPnL >= 0 ? '#22c55e' : '#ef4444';
    document.getElementById('avgWinLoss').textContent = '$' + avgWinLoss;
    
    // Update P&L chart
    updatePnLChart();
}

// Update P&L chart
function updatePnLChart() {
    const ctx = document.getElementById('pnlChart').getContext('2d');
    
    if (pnlChart) {
        pnlChart.destroy();
    }
    
    const sortedTrades = [...trades].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
    let cumulativePnL = 0;
    const data = sortedTrades.map(trade => {
        cumulativePnL += trade.pnl;
        return {
            x: new Date(trade.exitDate),
            y: cumulativePnL
        };
    });
    
    pnlChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Cumulative P&L',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    }
                },
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Journal functions
function addJournalEntry() {
    const input = document.getElementById('journalInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const entry = {
        id: Date.now(),
        text: text,
        date: new Date().toISOString()
    };
    
    journalEntries.unshift(entry);
    localStorage.setItem('journal', JSON.stringify(journalEntries));
    
    input.value = '';
    loadJournal();
}

function loadJournal() {
    const container = document.getElementById('journalEntries');
    
    if (journalEntries.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No journal entries yet. Start writing your trading thoughts!</p>';
        return;
    }
    
    container.innerHTML = journalEntries.map(entry => `
        <div class="journal-entry">
            <div class="journal-date">${new Date(entry.date).toLocaleString()}</div>
            <div class="journal-text">${entry.text}</div>
        </div>
    `).join('');
}
