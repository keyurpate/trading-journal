// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let accounts = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadTrades();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('importCsvButton').addEventListener('click', importCsv);
    document.getElementById('accountFilter').addEventListener('change', filterByAccount);
}

// CSV Import Function - Fixed for partial exits
function importCsv() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a CSV file to import');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        
        // Parse NinjaTrader format with position tracking
        const parsedTrades = [];
        let currentPosition = null;
        let exits = [];
        
        // Process from bottom to top (oldest to newest)
        for (let i = lines.length - 1; i >= 1; i--) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const trade = {
                instrument: values[0],
                action: values[1],
                quantity: parseInt(values[2]),
                price: parseFloat(values[3]),
                time: values[4],
                entryExit: values[6],
                account: values[12] || 'Unknown Account'
            };
            
            accounts.add(trade.account);
            
            if (trade.entryExit === 'Entry') {
                if (currentPosition && exits.length > 0) {
                    // Calculate weighted average exit
                    const totalExitQty = exits.reduce((sum, ex) => sum + ex.quantity, 0);
                    const weightedExitPrice = exits.reduce((sum, ex) => sum + (ex.price * ex.quantity), 0) / totalExitQty;
                    const exitTime = exits[0].time;
                    
                    const pnl = calculatePnL(currentPosition, { price: weightedExitPrice, quantity: totalExitQty });
                    
                    parsedTrades.push({
                        id: Date.now() + Math.random(),
                        symbol: currentPosition.instrument,
                        tradeType: currentPosition.action.toLowerCase() === 'buy' ? 'long' : 'short',
                        entryPrice: currentPosition.price,
                        exitPrice: weightedExitPrice,
                        entryDate: currentPosition.time,
                        exitDate: exitTime,
                        quantity: currentPosition.quantity,
                        account: currentPosition.account,
                        pnl: pnl,
                        notes: 'Imported from NinjaTrader' + (exits.length > 1 ? ' (scaled out: ' + exits.length + ' exits)' : '')
                    });
                    
                    exits = [];
                }
                
                currentPosition = trade;
            } else if (trade.entryExit === 'Exit') {
                exits.push(trade);
            }
        }
        
        // Save imported trades
        trades = [...trades, ...parsedTrades];
        localStorage.setItem('trades', JSON.stringify(trades));
        
        updateAccountFilter();
        loadTrades();
        
        alert('Successfully imported ' + parsedTrades.length + ' trades from ' + accounts.size + ' account(s)!');
        fileInput.value = '';
    };
    
    reader.readAsText(file);
}

// Calculate P&L
function calculatePnL(entry, exit) {
    let pnl;
    if (entry.action.toLowerCase() === 'buy') {
        pnl = (exit.price - entry.price) * entry.quantity;
    } else {
        pnl = (entry.price - exit.price) * entry.quantity;
    }
    
    if (entry.instrument.includes('MES')) {
        pnl = pnl * 5;
    }
    
    return pnl;
}

// Update account filter dropdown
function updateAccountFilter() {
    const filter = document.getElementById('accountFilter');
    const uniqueAccounts = [...new Set(trades.map(t => t.account))];
    filter.innerHTML = '<option value="all">All Accounts</option>';
    uniqueAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        filter.appendChild(option);
    });
}

// Filter trades by account
function filterByAccount() {
    const selectedAccount = document.getElementById('accountFilter').value;
    loadTrades(selectedAccount);
}

// Load and display trades
function loadTrades(filterAccount = 'all') {
    const container = document.getElementById('tradesContainer');
    let filteredTrades = trades;
    
    if (filterAccount !== 'all') {
        filteredTrades = trades.filter(t => t.account === filterAccount);
    }
    
    if (filteredTrades.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No trades found. Import a CSV file to get started!</p>';
        return;
    }
    
    const stats = calculateStats(filteredTrades);
    
    let html = '<div class="stats-section"><h2>Performance Statistics</h2><div class="stats-grid">';
    html += '<div class="stat-card"><h3>Total Trades</h3><p>' + stats.totalTrades + '</p></div>';
    html += '<div class="stat-card"><h3>Win Rate</h3><p>' + stats.winRate + '%</p></div>';
    html += '<div class="stat-card"><h3>Total P&L</h3><p style="color: ' + (stats.totalPnL >= 0 ? '#22c55e' : '#ef4444') + '">$' + stats.totalPnL.toFixed(2) + '</p></div>';
    html += '<div class="stat-card"><h3>Avg Win/Loss</h3><p>$' + stats.avgPnL.toFixed(2) + '</p></div>';
    html += '</div></div><div class="trades-section"><h2>Trade History</h2>';
    
    filteredTrades.forEach(trade => {
        html += '<div class="trade-card"><div class="trade-header"><div>';
        html += '<div class="trade-symbol">' + trade.symbol + '</div>';
        html += '<div style="color: #666; font-size: 14px;">' + trade.tradeType.toUpperCase() + ' | ' + trade.account + '</div></div>';
        html += '<div class="trade-pnl ' + (trade.pnl >= 0 ? 'profit' : 'loss') + '">' + (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) + '</div></div>';
        html += '<div class="trade-details"><div class="trade-detail">Entry: $' + trade.entryPrice.toFixed(2) + '<span>' + new Date(trade.entryDate).toLocaleString() + '</span></div>';
        html += '<div class="trade-detail">Exit: $' + trade.exitPrice.toFixed(2) + '<span>' + new Date(trade.exitDate).toLocaleString() + '</span></div>';
        html += '<div class="trade-detail">Quantity: ' + trade.quantity + '</div></div>';
        if (trade.notes) {
            html += '<div style="margin-top: 10px; font-size: 12px; color: #666;">' + trade.notes + '</div>';
        }
        html += '<button class="delete-btn" onclick="deleteTrade(' + trade.id + ')">Delete</button></div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Calculate statistics
function calculateStats(tradeList) {
    const totalTrades = tradeList.length;
    const wins = tradeList.filter(t => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    const totalPnL = tradeList.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    return { totalTrades, winRate, totalPnL, avgPnL };
}

// Delete trade
function deleteTrade(id) {
    if (confirm('Are you sure you want to delete this trade?')) {
        trades = trades.filter(t => t.id !== id);
        localStorage.setItem('trades', JSON.stringify(trades));
        updateAccountFilter();
        loadTrades();
    }
}