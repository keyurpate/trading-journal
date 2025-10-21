// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let accounts = new Set();
let polygonApiKey = localStorage.getItem('polygonApiKey') || 'e329C3pUBVi1hwvO3WZKFd45kh9Bt5fn';

let currentEditTradeId = null;
let currentScreenshotDataURL = null;
let currentDayDateKey = null;

let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

let currentAccountFilter = 'all';
let currentPlaybookFilter = 'all';

// INSTRUMENT MULTIPLIERS - ORDER MATTERS (check specific first, then general)
const INSTRUMENT_MULTIPLIERS = [
    // Micros first (more specific)
    { pattern: 'MES', multiplier: 5, name: 'Micro E-mini S&P 500' },
    { pattern: 'MNQ', multiplier: 2, name: 'Micro E-mini NASDAQ-100' },
    { pattern: 'MYM', multiplier: 0.5, name: 'Micro E-mini Dow' },
    { pattern: 'M2K', multiplier: 5, name: 'Micro E-mini Russell 2000' },
    { pattern: 'MGC', multiplier: 10, name: 'Micro Gold' },
    { pattern: 'MCL', multiplier: 100, name: 'Micro Crude Oil' },
    { pattern: 'SIL', multiplier: 1000, name: 'Micro Silver' },
    
    // Full size (more general - check after micros)
    { pattern: 'ES', multiplier: 50, name: 'E-mini S&P 500' },
    { pattern: 'NQ', multiplier: 20, name: 'E-mini NASDAQ-100' },
    { pattern: 'YM', multiplier: 5, name: 'E-mini Dow' },
    { pattern: 'RTY', multiplier: 50, name: 'E-mini Russell 2000' },
    { pattern: 'GC', multiplier: 100, name: 'Gold' },
    { pattern: 'SI', multiplier: 5000, name: 'Silver' },
    { pattern: 'CL', multiplier: 1000, name: 'Crude Oil' },
    { pattern: 'NG', multiplier: 10000, name: 'Natural Gas' },
    { pattern: 'HG', multiplier: 25000, name: 'Copper' },
    { pattern: 'ZC', multiplier: 50, name: 'Corn' },
    { pattern: 'ZS', multiplier: 50, name: 'Soybeans' },
    { pattern: 'ZW', multiplier: 50, name: 'Wheat' },
];

function getMultiplierForSymbol(symbol) {
    if (!symbol) return 1;
    const s = symbol.toUpperCase();
    
    // Check patterns in order (micros first)
    for (const item of INSTRUMENT_MULTIPLIERS) {
        if (s.includes(item.pattern)) {
            console.log(`✅ Matched "${item.pattern}" in "${symbol}" → ${item.name} → Multiplier: $${item.multiplier}`);
            return item.multiplier;
        }
    }
    
    console.warn(`⚠️ Unknown instrument: "${symbol}" → Using multiplier: 1`);
    return 1;
}

function calculatePnLFromTrade(trade) {
    const multiplier = getMultiplierForSymbol(trade.symbol);
    const pointDiff = trade.exitPrice - trade.entryPrice;
    let pnl;
    
    if (trade.tradeType === 'long') {
        pnl = pointDiff * multiplier * trade.quantity;
    } else {
        pnl = -pointDiff * multiplier * trade.quantity;
    }
    
    console.log(`📊 P&L: ${trade.symbol} | ${trade.tradeType.toUpperCase()} | Entry: $${trade.entryPrice.toFixed(2)} → Exit: $${trade.exitPrice.toFixed(2)} | Qty: ${trade.quantity} | Mult: ${multiplier} | Point Diff: ${pointDiff.toFixed(2)} → P&L: $${pnl.toFixed(2)}`);
    
    return pnl;
}

function recalcAllPnL() {
    console.log(`🔄 Recalculating P&L for ${trades.length} trades...`);
    trades.forEach((trade, idx) => {
        const oldPnL = trade.pnl;
        trade.pnl = calculatePnLFromTrade(trade);
        if (Math.abs(oldPnL - trade.pnl) > 0.01) {
            console.log(`✏️ Trade ${idx + 1} Updated: ${trade.symbol} | Old: $${oldPnL.toFixed(2)} → New: $${trade.pnl.toFixed(2)}`);
        }
    });
    localStorage.setItem('trades', JSON.stringify(trades));
    console.log('✅ P&L recalculation complete!');
}

document.addEventListener('DOMContentLoaded', function() {
    recalcAllPnL();
    loadTrades();
    setupEventListeners();
    loadApiKey();
    setupCalendar();
    
    if (!localStorage.getItem('polygonApiKey')) {
        localStorage.setItem('polygonApiKey', polygonApiKey);
    }
});

function setupEventListeners() {
    document.getElementById('importCsvButton').addEventListener('click', importCsv);
    document.getElementById('accountFilter').addEventListener('change', filterTrades);
    document.getElementById('playbookFilter').addEventListener('change', filterTrades);
    document.getElementById('saveApiKeyButton').addEventListener('click', saveApiKey);
    
    const exportBtn = document.getElementById('exportCsvButton');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            const dataStr = JSON.stringify(trades, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'trading-journal-backup-' + new Date().toISOString().split('T')[0] + '.json';
            link.click();
            URL.revokeObjectURL(url);
            alert('✅ Backup saved!');
        });
    }
    
    const clearBtn = document.getElementById('clearDataButton');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (confirm('⚠️ Delete ALL trades? This cannot be undone!')) {
                localStorage.clear();
                location.reload();
            }
        });
    }
    
    const modal = document.getElementById('chartModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = 'none';
        }
    }
    
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
}

function loadApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (polygonApiKey) {
        apiKeyInput.value = polygonApiKey;
    }
}

function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    polygonApiKey = apiKeyInput.value.trim();
    if (polygonApiKey) {
        localStorage.setItem('polygonApiKey', polygonApiKey);
        alert('✅ API Key saved!');
    }
}

function importCsv() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a CSV file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        
        console.log('📥 Starting CSV import...');
        
        const allOrders = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const order = {
                instrument: values[0],
                action: values[1],
                quantity: parseInt(values[2]) || 0,
                price: parseFloat(values[3]) || 0,
                time: values[4],
                entryExit: values[6],
                account: values[12] || 'Unknown Account'
            };
            
            allOrders.push(order);
            accounts.add(order.account);
        }
        
        allOrders.reverse();
        
        const groupedOrders = [];
        
        for (let i = 0; i < allOrders.length; i++) {
            const current = allOrders[i];
            const currentTime = new Date(current.time).getTime();
            
            let merged = false;
            for (let g = 0; g < groupedOrders.length; g++) {
                const group = groupedOrders[g];
                const groupTime = new Date(group.time).getTime();
                
                if (Math.abs(currentTime - groupTime) < 2000 && 
                    group.entryExit === current.entryExit &&
                    group.action === current.action &&
                    group.account === current.account &&
                    group.instrument === current.instrument) {
                    const prevQty = group.quantity;
                    group.quantity += current.quantity;
                    group.price = ((group.price * prevQty) + (current.price * current.quantity)) / group.quantity;
                    merged = true;
                    break;
                }
            }
            
            if (!merged) {
                groupedOrders.push({
                    instrument: current.instrument,
                    action: current.action,
                    quantity: current.quantity,
                    price: current.price,
                    time: current.time,
                    entryExit: current.entryExit,
                    account: current.account
                });
            }
        }
        
        const parsedTrades = [];
        let currentPosition = null;
        let exits = [];
        
        for (let i = 0; i < groupedOrders.length; i++) {
            const order = groupedOrders[i];
            
            if (order.entryExit === 'Entry') {
                if (currentPosition && exits.length > 0) {
                    const totalExitQty = exits.reduce((sum, ex) => sum + ex.quantity, 0);
                    const weightedExitPrice = exits.reduce((sum, ex) => sum + (ex.price * ex.quantity), 0) / totalExitQty;
                    const exitTime = exits[0].time;
                    
                    const tradeObj = {
                        id: Date.now() + Math.random(),
                        symbol: currentPosition.instrument,
                        tradeType: currentPosition.action.toLowerCase() === 'buy' ? 'long' : 'short',
                        entryPrice: currentPosition.price,
                        exitPrice: weightedExitPrice,
                        entryDate: currentPosition.time,
                        exitDate: exitTime,
                        quantity: currentPosition.quantity,
                        account: currentPosition.account,
                        playbook: '',
                        entryRating: 0,
                        exitRating: 0,
                        disciplineRating: 0,
                        tags: [],
                        mistakes: [],
                        notes: '',
                        screenshot: ''
                    };
                    
                    // Calculate P&L with logging
                    tradeObj.pnl = calculatePnLFromTrade(tradeObj);
                    parsedTrades.push(tradeObj);
                    
                    exits = [];
                }
                
                currentPosition = order;
                
            } else if (order.entryExit === 'Exit') {
                exits.push(order);
            }
        }
        
        if (currentPosition && exits.length > 0) {
            const totalExitQty = exits.reduce((sum, ex) => sum + ex.quantity, 0);
            const weightedExitPrice = exits.reduce((sum, ex) => sum + (ex.price * ex.quantity), 0) / totalExitQty;
            const exitTime = exits[0].time;
            
            const tradeObj = {
                id: Date.now() + Math.random(),
                symbol: currentPosition.instrument,
                tradeType: currentPosition.action.toLowerCase() === 'buy' ? 'long' : 'short',
                entryPrice: currentPosition.price,
                exitPrice: weightedExitPrice,
                entryDate: currentPosition.time,
                exitDate: exitTime,
                quantity: currentPosition.quantity,
                account: currentPosition.account,
                playbook: '',
                entryRating: 0,
                exitRating: 0,
                disciplineRating: 0,
                tags: [],
                mistakes: [],
                notes: '',
                screenshot: ''
            };
            
            tradeObj.pnl = calculatePnLFromTrade(tradeObj);
            parsedTrades.push(tradeObj);
        }
        
        console.log(`📥 Parsed ${parsedTrades.length} trades from CSV`);
        
        let duplicates = 0;
        let newTrades = 0;
        
        parsedTrades.forEach(newTrade => {
            const isDuplicate = trades.some(existingTrade => 
                existingTrade.symbol === newTrade.symbol &&
                existingTrade.entryDate === newTrade.entryDate &&
                existingTrade.account === newTrade.account &&
                Math.abs(existingTrade.entryPrice - newTrade.entryPrice) < 0.01 &&
                Math.abs(existingTrade.exitPrice - newTrade.exitPrice) < 0.01
            );
            
            if (isDuplicate) {
                duplicates++;
            } else {
                trades.push(newTrade);
                newTrades++;
            }
        });
        
        localStorage.setItem('trades', JSON.stringify(trades));
        
        updateFilters();
        renderCalendar();
        loadTrades();
        
        let message = '✅ Import Complete!\n\n';
        message += '📊 New trades: ' + newTrades + '\n';
        if (duplicates > 0) {
            message += '⚠️ Duplicates skipped: ' + duplicates + '\n';
        }
        message += '💼 Accounts: ' + [...new Set(trades.map(t => t.account))].length;
        
        console.log(message);
        alert(message);
        fileInput.value = '';
    };
    
    reader.readAsText(file);
}

function updateFilters() {
    const accountFilter = document.getElementById('accountFilter');
    const uniqueAccounts = [...new Set(trades.map(t => t.account))];
    accountFilter.innerHTML = '<option value="all">All Accounts</option>';
    uniqueAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        accountFilter.appendChild(option);
    });
    
    const playbookFilter = document.getElementById('playbookFilter');
    const uniquePlaybooks = [...new Set(trades.map(t => t.playbook).filter(p => p))];
    playbookFilter.innerHTML = '<option value="all">All Playbooks</option>';
    uniquePlaybooks.forEach(playbook => {
        const option = document.createElement('option');
        option.value = playbook;
        option.textContent = playbook;
        playbookFilter.appendChild(option);
    });
}

function filterTrades() {
    currentAccountFilter = document.getElementById('accountFilter').value;
    currentPlaybookFilter = document.getElementById('playbookFilter').value;
    
    renderCalendar();
    loadTrades(currentAccountFilter, currentPlaybookFilter);
}

function loadTrades(filterAccount = 'all', filterPlaybook = 'all', filterDate = null) {
    const container = document.getElementById('tradesContainer');
    let filteredTrades = trades;
    
    if (filterAccount !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.account === filterAccount);
    }
    
    if (filterPlaybook !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.playbook === filterPlaybook);
    }
    
    if (filterDate) {
        filteredTrades = filteredTrades.filter(t => {
            const date = new Date(t.entryDate);
            const tradeKey = date.getFullYear() + '-' + 
                            String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                            String(date.getDate()).padStart(2, '0');
            return tradeKey === filterDate;
        });
    }
    
    if (filteredTrades.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No trades found.</p>';
        return;
    }
    
    const stats = calculateStats(filteredTrades);
    
    let html = '<div class="stats-section"><h2>📈 Performance Statistics</h2><div class="stats-grid">';
    html += '<div class="stat-card"><h3>Total Trades</h3><p>' + stats.totalTrades + '</p></div>';
    html += '<div class="stat-card"><h3>Win Rate</h3><p>' + stats.winRate + '%</p></div>';
    html += '<div class="stat-card"><h3>Total P&L</h3><p>$' + stats.totalPnL.toFixed(2) + '</p></div>';
    html += '<div class="stat-card"><h3>Avg P&L</h3><p>$' + stats.avgPnL.toFixed(2) + '</p></div>';
    html += '<div class="stat-card"><h3>Best Trade</h3><p>$' + stats.bestTrade.toFixed(2) + '</p></div>';
    html += '<div class="stat-card"><h3>Worst Trade</h3><p>$' + stats.worstTrade.toFixed(2) + '</p></div>';
    html += '</div></div><div class="trades-section"><h2>📋 Trade History</h2>';
    
    filteredTrades.forEach(trade => {
        html += '<div class="trade-card"><div class="trade-header"><div>';
        html += '<div class="trade-symbol">' + trade.symbol + '</div>';
        if (trade.playbook) {
            html += '<span class="trade-playbook">📌 ' + trade.playbook + '</span>';
        }
        html += '<div style="color: #666; font-size: 14px; margin-top: 5px;">' + trade.tradeType.toUpperCase() + ' | ' + trade.account + '</div></div>';
        html += '<div class="trade-pnl ' + (trade.pnl >= 0 ? 'profit' : 'loss') + '">' + (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) + '</div></div>';
        
        if (trade.entryRating || trade.exitRating || trade.disciplineRating) {
            html += '<div class="trade-ratings">';
            if (trade.entryRating) {
                html += '<div class="rating-badge"><strong>Entry:</strong> ' + '⭐'.repeat(trade.entryRating) + '</div>';
            }
            if (trade.exitRating) {
                html += '<div class="rating-badge"><strong>Exit:</strong> ' + '⭐'.repeat(trade.exitRating) + '</div>';
            }
            if (trade.disciplineRating) {
                html += '<div class="rating-badge"><strong>Discipline:</strong> ' + '⭐'.repeat(trade.disciplineRating) + '</div>';
            }
            html += '</div>';
        }
        
        if (trade.tags && trade.tags.length > 0) {
            html += '<div class="trade-tags">';
            trade.tags.forEach(tag => {
                html += '<span class="tag">' + tag + '</span>';
            });
            html += '</div>';
        }
        
        if (trade.mistakes && trade.mistakes.length > 0) {
            html += '<div class="trade-tags">';
            trade.mistakes.forEach(mistake => {
                html += '<span class="tag mistake">⚠️ ' + mistake + '</span>';
            });
            html += '</div>';
        }
        
        html += '<div class="trade-details">';
        html += '<div class="trade-detail">Entry<span>$' + trade.entryPrice.toFixed(2) + '</span><span style="font-size:12px;color:#94a3b8">' + new Date(trade.entryDate).toLocaleString() + '</span></div>';
        html += '<div class="trade-detail">Exit<span>$' + trade.exitPrice.toFixed(2) + '</span><span style="font-size:12px;color:#94a3b8">' + new Date(trade.exitDate).toLocaleString() + '</span></div>';
        html += '<div class="trade-detail">Quantity<span>' + trade.quantity + '</span></div>';
        html += '</div>';
        
        if (trade.notes) {
            html += '<div class="trade-notes"><strong>📝 Notes:</strong> ' + trade.notes + '</div>';
        }
        
        if (trade.screenshot) {
            html += '<div style="margin-bottom: 15px;"><img src="' + trade.screenshot + '" style="max-width: 100%; border-radius: 10px; cursor: pointer;" onclick="window.open(\'' + trade.screenshot + '\', \'_blank\')" onerror="this.style.display=\'none\'"></div>';
        }
        
        html += '<div class="button-group">';
        html += '<button class="edit-btn" onclick="editTrade(' + trade.id + ')">✏️ Edit</button>';
        html += '<button class="view-chart-btn" onclick="viewChart(' + trade.id + ')">📊 View Chart</button>';
        html += '<button class="delete-btn" onclick="deleteTrade(' + trade.id + ')">🗑️ Delete</button>';
        html += '</div></div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function calculateStats(tradeList) {
    const totalTrades = tradeList.length;
    const wins = tradeList.filter(t => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    const totalPnL = tradeList.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    const bestTrade = tradeList.length > 0 ? Math.max(...tradeList.map(t => t.pnl)) : 0;
    const worstTrade = tradeList.length > 0 ? Math.min(...tradeList.map(t => t.pnl)) : 0;
    return { totalTrades, winRate, totalPnL, avgPnL, bestTrade, worstTrade };
}

function deleteTrade(id) {
    if (confirm('Delete this trade?')) {
        trades = trades.filter(t => t.id !== id);
        localStorage.setItem('trades', JSON.stringify(trades));
        updateFilters();
        renderCalendar();
        loadTrades(currentAccountFilter, currentPlaybookFilter);
    }
}

// (Continuing in next message with editTrade, calendar functions, and chart functions...)
