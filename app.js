// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let accounts = new Set();
let polygonApiKey = localStorage.getItem('polygonApiKey') || 'e329C3pUBVi1hwvO3WZKFd45kh9Bt5fn';

// Current edit trade
let currentEditTradeId = null;
let currentScreenshotDataURL = null;
let currentDayDateKey = null;

// Calendar state
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

// Current filters
let currentAccountFilter = 'all';
let currentPlaybookFilter = 'all';

// COMPLETE INSTRUMENT MULTIPLIERS ($ per 1 point move)
const INSTRUMENT_MULTIPLIERS = {
    // E-mini & Micro E-mini Stock Indices
    'ES': 50,      // E-mini S&P 500 ($50 per point)
    'MES': 5,      // Micro E-mini S&P 500 ($5 per point)
    'NQ': 20,      // E-mini NASDAQ-100 ($20 per point)
    'MNQ': 2,      // Micro E-mini NASDAQ-100 ($2 per point)
    'YM': 5,       // E-mini Dow ($5 per point)
    'MYM': 0.5,    // Micro E-mini Dow ($0.50 per point)
    'RTY': 50,     // E-mini Russell 2000 ($50 per point)
    'M2K': 5,      // Micro E-mini Russell 2000 ($5 per point)
    
    // Metals
    'GC': 100,     // Gold ($100 per point)
    'MGC': 10,     // Micro Gold ($10 per point)
    'SI': 5000,    // Silver ($5000 per point / $50 per 0.01)
    'SIL': 1000,   // Micro Silver ($1000 per point)
    'HG': 25000,   // Copper ($25000 per point / $250 per 0.01)
    
    // Energy
    'CL': 1000,    // Crude Oil ($1000 per point / $10 per 0.01)
    'MCL': 100,    // Micro Crude Oil ($100 per point)
    'NG': 10000,   // Natural Gas ($10000 per point / $100 per 0.01)
    'RB': 42000,   // Gasoline ($42000 per point)
    'HO': 42000,   // Heating Oil ($42000 per point)
    
    // Agriculture
    'ZC': 50,      // Corn ($50 per point)
    'ZS': 50,      // Soybeans ($50 per point)
    'ZW': 50,      // Wheat ($50 per point)
    
    // Currencies (to be filled if needed)
    '6E': 12.5,    // Euro FX ($12.50 per pip for mini)
    '6B': 6.25,    // British Pound
    
    // Bonds
    'ZN': 15.625,  // 10-Year T-Note ($15.625 per tick)
    'ZB': 31.25,   // 30-Year T-Bond
};

// Get multiplier for symbol
function getMultiplierForSymbol(symbol) {
    if (!symbol) return 1;
    const s = symbol.toUpperCase();
    
    // Check exact matches first
    for (const key in INSTRUMENT_MULTIPLIERS) {
        if (s.includes(key)) {
            console.log('✅ Matched', key, 'for', symbol, '→ Multiplier:', INSTRUMENT_MULTIPLIERS[key]);
            return INSTRUMENT_MULTIPLIERS[key];
        }
    }
    
    console.warn('⚠️ Unknown instrument:', symbol, '→ Using multiplier 1');
    return 1;
}

// Calculate PnL for a trade object
function calculatePnLFromTrade(trade) {
    const multiplier = getMultiplierForSymbol(trade.symbol);
    const pointDiff = trade.exitPrice - trade.entryPrice;
    let pnl;
    
    if (trade.tradeType === 'long') {
        pnl = pointDiff * multiplier * trade.quantity;
    } else {
        pnl = -pointDiff * multiplier * trade.quantity;
    }
    
    console.log('📊 PnL Calc:', trade.symbol, '|', trade.tradeType.toUpperCase(), '| Entry:', trade.entryPrice, '→ Exit:', trade.exitPrice, '| Qty:', trade.quantity, '| Multiplier:', multiplier, '→ P&L: $' + pnl.toFixed(2));
    return pnl;
}

// Recalculate all existing trades
function recalcAllPnL() {
    console.log('🔄 Recalculating P&L for', trades.length, 'trades...');
    trades.forEach(trade => {
        const oldPnL = trade.pnl;
        trade.pnl = calculatePnLFromTrade(trade);
        if (Math.abs(oldPnL - trade.pnl) > 0.01) {
            console.log('✏️ Updated:', trade.symbol, '| Old P&L: $' + oldPnL.toFixed(2), '→ New P&L: $' + trade.pnl.toFixed(2));
        }
    });
    localStorage.setItem('trades', JSON.stringify(trades));
    console.log('✅ P&L recalculation complete!');
}

// Initialize
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
        
        console.log('📥 Parsed', parsedTrades.length, 'trades from CSV');
        
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
        message += '💼 Total accounts: ' + [...new Set(trades.map(t => t.account))].length;
        
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

function editTrade(tradeId) {
    currentEditTradeId = tradeId;
    currentScreenshotDataURL = null;
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    
    const modal = document.getElementById('editTradeModal');
    
    document.getElementById('editPlaybook').value = trade.playbook || '';
    document.getElementById('editTags').value = trade.tags ? trade.tags.join(', ') : '';
    document.getElementById('editNotes').value = trade.notes || '';
    document.getElementById('editScreenshot').value = trade.screenshot || '';
    const fileInput = document.getElementById('editScreenshotFile');
    if (fileInput) fileInput.value = '';
    
    const preview = document.getElementById('screenshotPreview');
    if (trade.screenshot) {
        preview.innerHTML = '<img src="' + trade.screenshot + '" alt="Screenshot">';
    } else {
        preview.innerHTML = '';
    }
    
    if (fileInput) {
        fileInput.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    currentScreenshotDataURL = event.target.result;
                    preview.innerHTML = '<img src="' + currentScreenshotDataURL + '" alt="Preview">';
                };
                reader.readAsDataURL(file);
            }
        };
    }
    
    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.classList.remove('selected');
        const type = btn.dataset.type;
        const rating = parseInt(btn.dataset.rating);
        
        if (type === 'entry' && trade.entryRating === rating) btn.classList.add('selected');
        if (type === 'exit' && trade.exitRating === rating) btn.classList.add('selected');
        if (type === 'discipline' && trade.disciplineRating === rating) btn.classList.add('selected');
    });
    
    document.querySelectorAll('.mistake-check').forEach(check => {
        check.checked = trade.mistakes && trade.mistakes.includes(check.value);
    });
    
    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.onclick = function() {
            const type = this.dataset.type;
            document.querySelectorAll('.rating-btn[data-type="' + type + '"]').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
        };
    });
    
    const saveBtn = document.getElementById('saveTradeBtn');
    if (saveBtn) saveBtn.onclick = function() { saveTrade(); };
    
    const closeBtn = document.querySelector('.close-edit');
    if (closeBtn) closeBtn.onclick = function() { modal.style.display = 'none'; };
    
    modal.style.display = 'block';
}

function saveTrade() {
    const trade = trades.find(t => t.id === currentEditTradeId);
    if (!trade) return;
    
    trade.playbook = document.getElementById('editPlaybook').value;
    trade.tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(t => t);
    trade.notes = document.getElementById('editNotes').value;
    
    if (currentScreenshotDataURL) {
        trade.screenshot = currentScreenshotDataURL;
    } else {
        trade.screenshot = document.getElementById('editScreenshot').value;
    }
    
    const selectedEntry = document.querySelector('.rating-btn[data-type="entry"].selected');
    const selectedExit = document.querySelector('.rating-btn[data-type="exit"].selected');
    const selectedDiscipline = document.querySelector('.rating-btn[data-type="discipline"].selected');
    
    trade.entryRating = selectedEntry ? parseInt(selectedEntry.dataset.rating) : 0;
    trade.exitRating = selectedExit ? parseInt(selectedExit.dataset.rating) : 0;
    trade.disciplineRating = selectedDiscipline ? parseInt(selectedDiscipline.dataset.rating) : 0;
    
    trade.mistakes = [];
    document.querySelectorAll('.mistake-check:checked').forEach(check => {
        trade.mistakes.push(check.value);
    });
    
    trade.pnl = calculatePnLFromTrade(trade);
    
    localStorage.setItem('trades', JSON.stringify(trades));
    
    document.getElementById('editTradeModal').style.display = 'none';
    
    updateFilters();
    renderCalendar();
    loadTrades(currentAccountFilter, currentPlaybookFilter);
    
    alert('✅ Trade updated!');
}

function setupCalendar() {
    const prev = document.getElementById('prevMonth');
    const next = document.getElementById('nextMonth');
    if (prev) prev.addEventListener('click', () => {
        currentCalendarMonth--;
        if (currentCalendarMonth < 0) {
            currentCalendarMonth = 11;
            currentCalendarYear--;
        }
        renderCalendar();
    });
    if (next) next.addEventListener('click', () => {
        currentCalendarMonth++;
        if (currentCalendarMonth > 11) {
            currentCalendarMonth = 0;
            currentCalendarYear++;
        }
        renderCalendar();
    });
    
    const dayModal = document.getElementById('dayTradesModal');
    const closeDayBtn = document.querySelector('.close-day');
    
    if (closeDayBtn) {
        closeDayBtn.onclick = function() {
            dayModal.style.display = 'none';
        }
    }
    
    renderCalendar();
}

function renderCalendar() {
    const calendar = document.getElementById('calendar');
    const title = document.getElementById('calendarTitle');
    const monthlyPnLElement = document.getElementById('monthlyPnL');
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (title) title.textContent = monthNames[currentCalendarMonth] + ' ' + currentCalendarYear;
    
    let filteredTrades = trades;
    if (currentAccountFilter !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.account === currentAccountFilter);
    }
    if (currentPlaybookFilter !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.playbook === currentPlaybookFilter);
    }
    
    const dailyPnL = {};
    const dailyTrades = {};
    let monthlyTotal = 0;
    
    filteredTrades.forEach(trade => {
        const date = new Date(trade.entryDate);
        const dateKey = date.getFullYear() + '-' + 
                       String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(date.getDate()).padStart(2, '0');
        
        if (date.getMonth() === currentCalendarMonth && date.getFullYear() === currentCalendarYear) {
            monthlyTotal += trade.pnl;
        }
        
        if (!dailyPnL[dateKey]) {
            dailyPnL[dateKey] = 0;
            dailyTrades[dateKey] = [];
        }
        dailyPnL[dateKey] += trade.pnl;
        dailyTrades[dateKey].push(trade);
    });
    
    if (monthlyPnLElement) {
        monthlyPnLElement.textContent = 'Monthly P&L: ' + (monthlyTotal >= 0 ? '+' : '') + '$' + monthlyTotal.toFixed(2);
        monthlyPnLElement.className = monthlyTotal >= 0 ? 'profit' : 'loss';
    }
    
    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1);
    const lastDay = new Date(currentCalendarYear, currentCalendarMonth + 1, 0);
    const prevMonthLastDay = new Date(currentCalendarYear, currentCalendarMonth, 0);
    
    const startingDayOfWeek = firstDay.getDay();
    const totalDaysInMonth = lastDay.getDate();
    
    let html = '';
    
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        html += '<div class="calendar-day-header">' + day + '</div>';
    });
    
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthLastDay.getDate() - i;
        html += '<div class="calendar-day other-month"><div class="day-number">' + day + '</div></div>';
    }
    
    const today = new Date();
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateKey = currentCalendarYear + '-' + 
                       String(currentCalendarMonth + 1).padStart(2, '0') + '-' + 
                       String(day).padStart(2, '0');
        
        const pnl = dailyPnL[dateKey] || 0;
        const tradesCount = dailyTrades[dateKey] ? dailyTrades[dateKey].length : 0;
        
        let classes = 'calendar-day';
        if (tradesCount > 0) classes += ' has-trades';
        if (pnl > 0) classes += ' profit';
        if (pnl < 0) classes += ' loss';
        if (today.getDate() === day && 
            today.getMonth() === currentCalendarMonth && 
            today.getFullYear() === currentCalendarYear) {
            classes += ' today';
        }
        
        html += '<div class="' + classes + '" onclick="showDayTrades(\'' + dateKey + '\')">';
        html += '<div class="day-number">' + day + '</div>';
        if (pnl !== 0) {
            html += '<div class="day-pnl ' + (pnl >= 0 ? 'profit' : 'loss') + '">';
            html += (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2);
            html += '</div>';
        }
        if (tradesCount > 0) {
            html += '<div class="day-trades-count">' + tradesCount + ' trade' + (tradesCount > 1 ? 's' : '') + '</div>';
        }
        html += '</div>';
    }
    
    const remainingCells = 42 - (startingDayOfWeek + totalDaysInMonth);
    for (let day = 1; day <= remainingCells; day++) {
        html += '<div class="calendar-day other-month"><div class="day-number">' + day + '</div></div>';
    }
    
    if (calendar) calendar.innerHTML = html;
}

function showDayTrades(dateKey) {
    currentDayDateKey = dateKey;
    
    let dayTrades = trades.filter(trade => {
        const date = new Date(trade.entryDate);
        const tradeKey = date.getFullYear() + '-' + 
                        String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(date.getDate()).padStart(2, '0');
        return tradeKey === dateKey;
    });
    
    if (currentAccountFilter !== 'all') {
        dayTrades = dayTrades.filter(t => t.account === currentAccountFilter);
    }
    if (currentPlaybookFilter !== 'all') {
        dayTrades = dayTrades.filter(t => t.playbook === currentPlaybookFilter);
    }
    
    if (dayTrades.length === 0) {
        alert('No trades found for this day');
        return;
    }
    
    const modal = document.getElementById('dayTradesModal');
    const title = document.getElementById('dayTradesTitle');
    const content = document.getElementById('dayTradesContent');
    
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const totalPnL = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = dayTrades.filter(t => t.pnl > 0).length;
    const losses = dayTrades.filter(t => t.pnl < 0).length;
    const winRate = dayTrades.length > 0 ? ((wins / dayTrades.length) * 100).toFixed(1) : 0;
    
    if (title) title.innerHTML = '📅 ' + dateStr;
    
    let html = '<div class="day-summary">';
    html += '<div class="day-summary-item"><h3>Total Trades</h3><p>' + dayTrades.length + '</p></div>';
    html += '<div class="day-summary-item"><h3>Wins / Losses</h3><p>' + wins + ' / ' + losses + '</p></div>';
    html += '<div class="day-summary-item"><h3>Win Rate</h3><p>' + winRate + '%</p></div>';
    html += '<div class="day-summary-item"><h3>Total P&L</h3><p style="color:' + (totalPnL >= 0 ? '#d1fae5' : '#fee2e2') + '">' + (totalPnL >= 0 ? '+' : '') + '$' + totalPnL.toFixed(2) + '</p></div>';
    html += '</div>';
    
    dayTrades.forEach(trade => {
        html += '<div class="day-trade-item">';
        html += '<div class="day-trade-info">';
        html += '<div class="day-trade-symbol">' + trade.symbol + ' - ' + trade.tradeType.toUpperCase() + '</div>';
        html += '<div class="day-trade-details">';
        html += '🕐 ' + new Date(trade.entryDate).toLocaleTimeString();
        html += ' | Entry: $' + trade.entryPrice.toFixed(2) + ' → Exit: $' + trade.exitPrice.toFixed(2);
        html += ' | Qty: ' + trade.quantity;
        if (trade.playbook) html += ' | 📌 ' + trade.playbook;
        html += '</div></div>';
        html += '<div class="day-trade-pnl ' + (trade.pnl >= 0 ? 'profit' : 'loss') + '">';
        html += (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2);
        html += '</div></div>';
    });
    
    if (content) content.innerHTML = html;
    
    const viewBtn = document.getElementById('viewDayTradesBtn');
    const deleteBtn = document.getElementById('deleteDayTradesBtn');
    if (viewBtn) viewBtn.onclick = function() {
        modal.style.display = 'none';
        loadTradesByDate(dateKey);
    };
    if (deleteBtn) deleteBtn.onclick = function() {
        deleteDayTrades(dateKey);
    };
    
    if (modal) modal.style.display = 'block';
}

function loadTradesByDate(dateKey) {
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    document.getElementById('tradesContainer').scrollIntoView({ behavior: 'smooth' });
    
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #667eea; color: white; padding: 15px 25px; border-radius: 10px; z-index: 10000; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.3);';
    notification.textContent = '📅 Showing trades for ' + dateStr;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
    
    loadTrades(currentAccountFilter, currentPlaybookFilter, dateKey);
}

function deleteDayTrades(dateKey) {
    let dayTrades = trades.filter(trade => {
        const date = new Date(trade.entryDate);
        const tradeKey = date.getFullYear() + '-' + 
                        String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(date.getDate()).padStart(2, '0');
        return tradeKey === dateKey;
    });
    
    if (currentAccountFilter !== 'all') {
        dayTrades = dayTrades.filter(t => t.account === currentAccountFilter);
    }
    if (currentPlaybookFilter !== 'all') {
        dayTrades = dayTrades.filter(t => t.playbook === currentPlaybookFilter);
    }
    
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    if (confirm('⚠️ Delete ALL ' + dayTrades.length + ' trades from ' + dateStr + '?')) {
        const idsToDelete = dayTrades.map(t => t.id);
        trades = trades.filter(trade => !idsToDelete.includes(trade.id));
        
        localStorage.setItem('trades', JSON.stringify(trades));
        
        const modal = document.getElementById('dayTradesModal');
        if (modal) modal.style.display = 'none';
        
        renderCalendar();
        updateFilters();
        loadTrades(currentAccountFilter, currentPlaybookFilter);
        
        alert('✅ Deleted ' + dayTrades.length + ' trades');
    }
}

function getPolygonTicker(symbol) {
    if (symbol.includes('MES')) return 'I:MES';
    if (symbol.includes('MNQ')) return 'I:NQ';
    if (symbol.includes('ES')) return 'I:ES';
    if (symbol.includes('NQ')) return 'I:NQ';
    if (symbol.includes('YM')) return 'I:YM';
    if (symbol.includes('RTY')) return 'I:RTY';
    if (symbol.includes('GC')) return 'C:GC';
    return symbol.split(' ')[0];
}

async function fetchRealMarketData(symbol, startDate, endDate, timeframe) {
    if (!polygonApiKey) return null;
    
    const ticker = getPolygonTicker(symbol);
    
    let multiplier = 1;
    let timespan = 'minute';
    if (timeframe === 60) { multiplier = 1; timespan = 'minute'; }
    else if (timeframe === 300) { multiplier = 5; timespan = 'minute'; }
    else if (timeframe === 900) { multiplier = 15; timespan = 'minute'; }
    else if (timeframe === 3600) { multiplier = 1; timespan = 'hour'; }
    
    const from = new Date(startDate).toISOString().split('T')[0];
    const to = new Date(endDate).toISOString().split('T')[0];
    
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${polygonApiKey}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            return data.results.map(candle => ({
                time: Math.floor(candle.t / 1000),
                open: candle.o,
                high: candle.h,
                low: candle.l,
                close: candle.c
            }));
        }
    } catch (error) {
        console.error('API Error:', error);
    }
    return null;
}

function generateRealisticCandles(symbol, entryTime, exitTime, entryPrice, exitPrice, timeframe) {
    const candles = [];
    const startTime = new Date(entryTime).getTime() / 1000;
    const endTime = new Date(exitTime).getTime() / 1000;
    const totalDuration = endTime - startTime;
    const numCandles = Math.max(50, Math.floor(totalDuration / timeframe));
    const priceRange = Math.abs(exitPrice - entryPrice);
    const tickSize = 0.25;
    
    let currentPrice = entryPrice;
    let currentTime = startTime - (numCandles * 0.3 * timeframe);
    
    for (let i = 0; i < numCandles; i++) {
        const progress = i / numCandles;
        const targetPrice = entryPrice + (exitPrice - entryPrice) * progress;
        currentPrice = currentPrice * 0.7 + targetPrice * 0.3;
        
        const open = Math.round(currentPrice / tickSize) * tickSize;
        const close = Math.round((currentPrice + (Math.random() - 0.5) * priceRange * 0.1) / tickSize) * tickSize;
        const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.001) / tickSize) * tickSize;
        const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.001) / tickSize) * tickSize;
        
        candles.push({
            time: Math.floor(currentTime),
            open: open,
            high: high,
            low: low,
            close: close
        });
        
        currentTime += timeframe;
    }
    
    return candles;
}

function closeModal() {
    document.getElementById('chartModal').style.display = 'none';
}

async function viewChart(tradeId) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    
    const modal = document.getElementById('chartModal');
    const chartTitle = document.getElementById('chartTitle');
    const chartDiv = document.getElementById('tradeChart');
    
    chartTitle.innerHTML = trade.symbol + ' - ' + trade.tradeType.toUpperCase() + ' <span style="float: right; font-size: 16px;"><select id="timeframeSelect"><option value="60">1 min</option><option value="300" selected>5 min</option><option value="900">15 min</option></select></span>';
    
    chartDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#667eea;">🔄 Loading...</div>';
    
    let chartInstance = null;
    
    async function renderChart(timeframe) {
        if (chartInstance) chartDiv.innerHTML = '';
        
        const entryDate = new Date(trade.entryDate);
        const exitDate = new Date(trade.exitDate);
        const duration = exitDate - entryDate;
        
        const startDate = new Date(entryDate.getTime() - duration);
        const endDate = new Date(exitDate.getTime() + duration * 0.5);
        
        let candleData = await fetchRealMarketData(trade.symbol, startDate, endDate, timeframe);
        
        if (!candleData || candleData.length === 0) {
            candleData = generateRealisticCandles(trade.symbol, trade.entryDate, trade.exitDate, trade.entryPrice, trade.exitPrice, timeframe);
        }
        
        chartDiv.innerHTML = '';
        
        chartInstance = LightweightCharts.createChart(chartDiv, {
            width: chartDiv.clientWidth,
            height: 600,
            layout: { background: { color: '#ffffff' }, textColor: '#333' },
            grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
            timeScale: { timeVisible: true, secondsVisible: true }
        });

        const ema9Data = [];
        const ema21Data = [];
        let ema9 = candleData[0].close;
        let ema21 = candleData[0].close;
        
        candleData.forEach(candle => {
            ema9 = candle.close * 0.2 + ema9 * 0.8;
            ema9Data.push({ time: candle.time, value: ema9 });
            ema21 = candle.close * 0.095 + ema21 * 0.905;
            ema21Data.push({ time: candle.time, value: ema21 });
        });
        
        const candleSeries = chartInstance.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderUpColor: '#10b981',
            borderDownColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444'
        });
        candleSeries.setData(candleData);
        
        chartInstance.addLineSeries({ color: '#8b5cf6', lineWidth: 2 }).setData(ema9Data);
        chartInstance.addLineSeries({ color: '#f97316', lineWidth: 2 }).setData(ema21Data);
        
        const entryTimestamp = Math.floor(entryDate.getTime() / 1000);
        const exitTimestamp = Math.floor(exitDate.getTime() / 1000);
        
        const entryCandle = candleData.reduce((prev, curr) => 
            Math.abs(curr.time - entryTimestamp) < Math.abs(prev.time - entryTimestamp) ? curr : prev
        );
        
        const exitCandle = candleData.reduce((prev, curr) => 
            Math.abs(curr.time - exitTimestamp) < Math.abs(prev.time - exitTimestamp) ? curr : prev
        );
        
        candleSeries.setMarkers([
            {
                time: entryCandle.time,
                position: trade.tradeType === 'long' ? 'belowBar' : 'aboveBar',
                color: '#10b981',
                shape: 'arrowUp',
                text: 'Entry: $' + trade.entryPrice.toFixed(2)
            },
            {
                time: exitCandle.time,
                position: trade.tradeType === 'long' ? 'aboveBar' : 'belowBar',
                color: trade.pnl >= 0 ? '#10b981' : '#ef4444',
                shape: 'arrowDown',
                text: 'Exit: $' + trade.exitPrice.toFixed(2) + ' ($' + trade.pnl.toFixed(2) + ')'
            }
        ]);
        
        chartInstance.timeScale().fitContent();
    }
    
    await renderChart(300);
    
    setTimeout(() => {
        const selector = document.getElementById('timeframeSelect');
        if (selector) selector.addEventListener('change', (e) => renderChart(parseInt(e.target.value)));
        const closeBtn = document.querySelector('.close');
        if (closeBtn) closeBtn.onclick = closeModal;
    }, 100);
    
    modal.style.display = 'block';
}
