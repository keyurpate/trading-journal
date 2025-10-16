// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let accounts = new Set();
let polygonApiKey = localStorage.getItem('polygonApiKey') || 'e329C3pUBVi1hwvO3WZKFd45kh9Bt5fn';

// Current edit trade
let currentEditTradeId = null;

// Calendar state
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

// Current filters
let currentAccountFilter = 'all';
let currentPlaybookFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
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
    
    // Modal close handlers
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
        alert('✅ API Key saved successfully!');
    } else {
        alert('Please enter a valid API key.');
    }
}

// CSV Import with grouping
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
        
        const allOrders = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const order = {
                instrument: values[0],
                action: values[1],
                quantity: parseInt(values[2]),
                price: parseFloat(values[3]),
                time: values[4],
                entryExit: values[6],
                account: values[12] || 'Unknown Account'
            };
            
            allOrders.push(order);
            accounts.add(order.account);
        }
        
        allOrders.reverse();
        
        // Group by time
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
                    group.action === current.action) {
                    group.quantity += current.quantity;
                    group.price = ((group.price * (group.quantity - current.quantity)) + (current.price * current.quantity)) / group.quantity;
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
        
        console.log('Grouped orders:', groupedOrders);
        
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
                        playbook: '',
                        entryRating: 0,
                        exitRating: 0,
                        disciplineRating: 0,
                        tags: [],
                        mistakes: [],
                        notes: '',
                        screenshot: ''
                    });
                    
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
                playbook: '',
                entryRating: 0,
                exitRating: 0,
                disciplineRating: 0,
                tags: [],
                mistakes: [],
                notes: '',
                screenshot: ''
            });
        }
        
        console.log('Parsed trades:', parsedTrades);
        
        trades = [...trades, ...parsedTrades];
        localStorage.setItem('trades', JSON.stringify(trades));
        
        updateFilters();
        renderCalendar();
        loadTrades();
        
        alert('✅ Successfully imported ' + parsedTrades.length + ' trades!');
        fileInput.value = '';
    };
    
    reader.readAsText(file);
}

function calculatePnL(entry, exit) {
    let pnl;
    if (entry.action.toLowerCase() === 'buy') {
        pnl = (exit.price - entry.price) * entry.quantity;
    } else {
        pnl = (entry.price - exit.price) * entry.quantity;
    }
    
    // FIXED: MNQ multiplier is $2 per point (not $5)
    if (entry.instrument.includes('MNQ')) {
        pnl = pnl * 2;
    } else if (entry.instrument.includes('MES')) {
        pnl = pnl * 5;
    }
    
    return pnl;
}

function updateFilters() {
    // Update account filter
    const accountFilter = document.getElementById('accountFilter');
    const uniqueAccounts = [...new Set(trades.map(t => t.account))];
    accountFilter.innerHTML = '<option value="all">All Accounts</option>';
    uniqueAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        accountFilter.appendChild(option);
    });
    
    // Update playbook filter
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
    
    // Update calendar when filters change
    renderCalendar();
    loadTrades(currentAccountFilter, currentPlaybookFilter);
}

function loadTrades(filterAccount = 'all', filterPlaybook = 'all') {
    const container = document.getElementById('tradesContainer');
    let filteredTrades = trades;
    
    if (filterAccount !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.account === filterAccount);
    }
    
    if (filterPlaybook !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.playbook === filterPlaybook);
    }
    
    if (filteredTrades.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No trades found. Import a CSV file to get started!</p>';
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
        
        // Ratings
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
        
        // Tags and Mistakes
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
        
        // Notes
        if (trade.notes) {
            html += '<div class="trade-notes"><strong>📝 Notes:</strong> ' + trade.notes + '</div>';
        }
        
        // Screenshot
        if (trade.screenshot) {
            html += '<div style="margin-bottom: 15px;"><img src="' + trade.screenshot + '" style="max-width: 100%; border-radius: 10px;" onerror="this.style.display=\'none\'"></div>';
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
    if (confirm('Are you sure you want to delete this trade?')) {
        trades = trades.filter(t => t.id !== id);
        localStorage.setItem('trades', JSON.stringify(trades));
        updateFilters();
        renderCalendar();
        loadTrades(currentAccountFilter, currentPlaybookFilter);
    }
}

// Edit Trade Modal
function editTrade(tradeId) {
    currentEditTradeId = tradeId;
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    
    const modal = document.getElementById('editTradeModal');
    
    // Populate form
    document.getElementById('editPlaybook').value = trade.playbook || '';
    document.getElementById('editTags').value = trade.tags ? trade.tags.join(', ') : '';
    document.getElementById('editNotes').value = trade.notes || '';
    document.getElementById('editScreenshot').value = trade.screenshot || '';
    
    // Set ratings
    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.classList.remove('selected');
        const type = btn.dataset.type;
        const rating = parseInt(btn.dataset.rating);
        
        if (type === 'entry' && trade.entryRating === rating) btn.classList.add('selected');
        if (type === 'exit' && trade.exitRating === rating) btn.classList.add('selected');
        if (type === 'discipline' && trade.disciplineRating === rating) btn.classList.add('selected');
    });
    
    // Set mistakes
    document.querySelectorAll('.mistake-check').forEach(check => {
        check.checked = trade.mistakes && trade.mistakes.includes(check.value);
    });
    
    // Setup rating buttons
    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.onclick = function() {
            const type = this.dataset.type;
            document.querySelectorAll('.rating-btn[data-type="' + type + '"]').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
        };
    });
    
    // Save button
    document.getElementById('saveTradeBtn').onclick = function() {
        saveTrade();
    };
    
    // Close button
    const closeBtn = document.querySelector('.close-edit');
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };
    
    modal.style.display = 'block';
}

function saveTrade() {
    const trade = trades.find(t => t.id === currentEditTradeId);
    if (!trade) return;
    
    trade.playbook = document.getElementById('editPlaybook').value;
    trade.tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(t => t);
    trade.notes = document.getElementById('editNotes').value;
    trade.screenshot = document.getElementById('editScreenshot').value;
    
    // Get ratings
    const selectedEntry = document.querySelector('.rating-btn[data-type="entry"].selected');
    const selectedExit = document.querySelector('.rating-btn[data-type="exit"].selected');
    const selectedDiscipline = document.querySelector('.rating-btn[data-type="discipline"].selected');
    
    trade.entryRating = selectedEntry ? parseInt(selectedEntry.dataset.rating) : 0;
    trade.exitRating = selectedExit ? parseInt(selectedExit.dataset.rating) : 0;
    trade.disciplineRating = selectedDiscipline ? parseInt(selectedDiscipline.dataset.rating) : 0;
    
    // Get mistakes
    trade.mistakes = [];
    document.querySelectorAll('.mistake-check:checked').forEach(check => {
        trade.mistakes.push(check.value);
    });
    
    localStorage.setItem('trades', JSON.stringify(trades));
    
    document.getElementById('editTradeModal').style.display = 'none';
    
    updateFilters();
    renderCalendar();
    loadTrades(currentAccountFilter, currentPlaybookFilter);
    
    alert('✅ Trade updated successfully!');
}

// Calendar Functions
function setupCalendar() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentCalendarMonth--;
        if (currentCalendarMonth < 0) {
            currentCalendarMonth = 11;
            currentCalendarYear--;
        }
        renderCalendar();
    });
    
    document.getElementById('nextMonth').addEventListener('click', () => {
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
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    title.textContent = monthNames[currentCalendarMonth] + ' ' + currentCalendarYear;
    
    // FIXED: Filter trades by current account filter
    let filteredTrades = trades;
    if (currentAccountFilter !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.account === currentAccountFilter);
    }
    if (currentPlaybookFilter !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.playbook === currentPlaybookFilter);
    }
    
    const dailyPnL = {};
    const dailyTrades = {};
    
    filteredTrades.forEach(trade => {
        const date = new Date(trade.entryDate);
        const dateKey = date.getFullYear() + '-' + 
                       String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(date.getDate()).padStart(2, '0');
        
        if (!dailyPnL[dateKey]) {
            dailyPnL[dateKey] = 0;
            dailyTrades[dateKey] = [];
        }
        dailyPnL[dateKey] += trade.pnl;
        dailyTrades[dateKey].push(trade);
    });
    
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
    
    calendar.innerHTML = html;
}

function showDayTrades(dateKey) {
    // FIXED: Apply current filters to day trades
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
    
    title.innerHTML = '📅 ' + dateStr;
    
    // Day summary
    let html = '<div class="day-summary">';
    html += '<div class="day-summary-item"><h3>Total Trades</h3><p>' + dayTrades.length + '</p></div>';
    html += '<div class="day-summary-item"><h3>Wins / Losses</h3><p>' + wins + ' / ' + losses + '</p></div>';
    html += '<div class="day-summary-item"><h3>Win Rate</h3><p>' + winRate + '%</p></div>';
    html += '<div class="day-summary-item"><h3>Total P&L</h3><p style="color:' + (totalPnL >= 0 ? '#d1fae5' : '#fee2e2') + '">' + (totalPnL >= 0 ? '+' : '') + '$' + totalPnL.toFixed(2) + '</p></div>';
    html += '</div>';
    
    // Individual trades
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
    
    content.innerHTML = html;
    
    document.getElementById('deleteDayTradesBtn').onclick = function() {
        deleteDayTrades(dateKey);
    };
    
    modal.style.display = 'block';
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
    
    if (confirm('⚠️ Are you sure you want to delete ALL ' + dayTrades.length + ' trades from ' + dateStr + '?')) {
        const idsToDelete = dayTrades.map(t => t.id);
        trades = trades.filter(trade => !idsToDelete.includes(trade.id));
        
        localStorage.setItem('trades', JSON.stringify(trades));
        
        document.getElementById('dayTradesModal').style.display = 'none';
        
        renderCalendar();
        updateFilters();
        loadTrades(currentAccountFilter, currentPlaybookFilter);
        
        alert('✅ Successfully deleted ' + dayTrades.length + ' trades from ' + dateStr);
    }
}

// Polygon API Functions
function getPolygonTicker(symbol) {
    if (symbol.includes('MES')) return 'I:MES';
    if (symbol.includes('MNQ')) return 'I:NQ';
    if (symbol.includes('ES')) return 'I:ES';
    if (symbol.includes('NQ')) return 'I:NQ';
    if (symbol.includes('YM')) return 'I:YM';
    if (symbol.includes('RTY')) return 'I:RTY';
    return symbol.split(' ')[0];
}

async function fetchRealMarketData(symbol, startDate, endDate, timeframe) {
    if (!polygonApiKey) {
        console.warn('No API key set.');
        return null;
    }
    
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
    
    console.log('Fetching:', url.replace(polygonApiKey, 'KEY'));
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            console.log(`✅ Got ${data.results.length} real candles`);
            return data.results.map(candle => ({
                time: Math.floor(candle.t / 1000),
                open: candle.o,
                high: candle.h,
                low: candle.l,
                close: candle.c,
                volume: candle.v
            }));
        } else {
            console.warn('No data:', data.status);
            return null;
        }
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

function generateRealisticCandles(symbol, entryTime, exitTime, entryPrice, exitPrice, timeframe) {
    const candles = [];
    const startTime = new Date(entryTime).getTime() / 1000;
    const endTime = new Date(exitTime).getTime() / 1000;
    
    const totalDuration = endTime - startTime;
    const numCandles = Math.max(50, Math.floor(totalDuration / timeframe));
    
    const beforeEntry = Math.floor(numCandles * 0.3);
    const duringTrade = Math.floor(numCandles * 0.5);
    const afterExit = numCandles - beforeEntry - duringTrade;
    
    const priceRange = Math.abs(exitPrice - entryPrice);
    const tickSize = (symbol.includes('MES') || symbol.includes('MNQ')) ? 0.25 : 0.01;
    
    let currentPrice = entryPrice - priceRange * 0.2;
    let currentTime = startTime - (beforeEntry * timeframe);
    
    for (let i = 0; i < beforeEntry; i++) {
        const candle = generateCandle(currentTime, currentPrice, priceRange * 0.3, tickSize);
        candles.push(candle);
        currentPrice = candle.close;
        currentTime += timeframe;
    }
    
    for (let i = 0; i < duringTrade; i++) {
        const progress = i / duringTrade;
        const targetPrice = entryPrice + (exitPrice - entryPrice) * progress;
        currentPrice = currentPrice * 0.3 + targetPrice * 0.7;
        
        const candle = generateCandle(currentTime, currentPrice, priceRange * 0.4, tickSize);
        candles.push(candle);
        currentPrice = candle.close;
        currentTime += timeframe;
    }
    
    for (let i = 0; i < afterExit; i++) {
        const candle = generateCandle(currentTime, currentPrice, priceRange * 0.3, tickSize);
        candles.push(candle);
        currentPrice = candle.close;
        currentTime += timeframe;
    }
    
    return candles;
}

function generateCandle(time, price, volatility, tickSize) {
    const bodySize = volatility * (0.3 + Math.random() * 0.4);
    const wickSize = volatility * (0.2 + Math.random() * 0.3);
    
    const open = roundToTick(price + (Math.random() - 0.5) * bodySize, tickSize);
    const close = roundToTick(price + (Math.random() - 0.5) * bodySize, tickSize);
    const high = roundToTick(Math.max(open, close) + Math.random() * wickSize, tickSize);
    const low = roundToTick(Math.min(open, close) - Math.random() * wickSize, tickSize);
    
    return {
        time: Math.floor(time),
        open: open,
        high: high,
        low: low,
        close: close,
        volume: Math.floor(500 + Math.random() * 2000)
    };
}

function roundToTick(price, tickSize) {
    return Math.round(price / tickSize) * tickSize;
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
    
    chartTitle.innerHTML = trade.symbol + ' - ' + trade.tradeType.toUpperCase() + ' Trade <span style="float: right; font-size: 16px; margin-top: 5px;"><select id="timeframeSelect"><option value="60">1 min</option><option value="300" selected>5 min</option><option value="900">15 min</option><option value="3600">1 hour</option></select></span>';
    
    chartDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#667eea;">🔄 Loading real market data...</div>';
    
    let chartInstance = null;
    
    async function renderChart(timeframe) {
        if (chartInstance) {
            chartDiv.innerHTML = '';
        }
        
        chartDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#667eea;">Loading...</div>';
        
        const parseCSVDate = (dateStr) => {
            return new Date(dateStr);
        };
        
        const entryDate = parseCSVDate(trade.entryDate);
        const exitDate = parseCSVDate(trade.exitDate);
        const tradeDuration = exitDate - entryDate;
        
        const startDate = new Date(entryDate.getTime() - tradeDuration * 1);
        const endDate = new Date(exitDate.getTime() + tradeDuration * 0.5);
        
        console.log('=== TRADE TIMES ===');
        console.log('Entry:', entryDate.toLocaleString());
        console.log('Exit:', exitDate.toLocaleString());
        
        let candleData = await fetchRealMarketData(trade.symbol, startDate, endDate, timeframe);
        
        if (!candleData || candleData.length === 0) {
            console.log('⚠️ Using simulated data');
            candleData = generateRealisticCandles(
                trade.symbol,
                trade.entryDate,
                trade.exitDate,
                trade.entryPrice,
                trade.exitPrice,
                timeframe
            );
        }
        
        chartDiv.innerHTML = '';
        
        chartInstance = LightweightCharts.createChart(chartDiv, {
            width: chartDiv.clientWidth,
            height: 600,
            layout: {
                background: { color: '#ffffff' },
                textColor: '#333',
            },
            grid: {
                vertLines: { color: '#f0f0f0' },
                horzLines: { color: '#f0f0f0' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#d1d4dc',
            },
            timeScale: {
                borderColor: '#d1d4dc',
                timeVisible: true,
                secondsVisible: true,
            },
        });

        const ema9Data = [];
        const ema21Data = [];
        const sma200Data = [];
        
        let ema9 = candleData[0].close;
        let ema21 = candleData[0].close;
        const smaWindow = [];
        
        candleData.forEach((candle, i) => {
            const k9 = 2 / 10;
            ema9 = candle.close * k9 + ema9 * (1 - k9);
            ema9Data.push({ time: candle.time, value: ema9 });
            
            const k21 = 2 / 22;
            ema21 = candle.close * k21 + ema21 * (1 - k21);
            ema21Data.push({ time: candle.time, value: ema21 });
            
            smaWindow.push(candle.close);
            if (smaWindow.length > 200) smaWindow.shift();
            if (i >= 199) {
                const sma200 = smaWindow.reduce((a, b) => a + b, 0) / smaWindow.length;
                sma200Data.push({ time: candle.time, value: sma200 });
            }
        });
        
        const candleSeries = chartInstance.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderUpColor: '#10b981',
            borderDownColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });
        candleSeries.setData(candleData);
        
        const ema9Series = chartInstance.addLineSeries({ color: '#8b5cf6', lineWidth: 2 });
        ema9Series.setData(ema9Data);
        
        const ema21Series = chartInstance.addLineSeries({ color: '#f97316', lineWidth: 2 });
        ema21Series.setData(ema21Data);
        
        if (sma200Data.length > 0) {
            const sma200Series = chartInstance.addLineSeries({ color: '#3b82f6', lineWidth: 2 });
            sma200Series.setData(sma200Data);
        }
        
        // REMOVED VOLUME - No longer displayed
        
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
                text: 'Entry: $' + trade.entryPrice.toFixed(2),
            },
            {
                time: exitCandle.time,
                position: trade.tradeType === 'long' ? 'aboveBar' : 'belowBar',
                color: trade.pnl >= 0 ? '#10b981' : '#ef4444',
                shape: 'arrowDown',
                text: 'Exit: $' + trade.exitPrice.toFixed(2) + ' ($' + trade.pnl.toFixed(2) + ')',
            }
        ]);
        
        chartInstance.timeScale().fitContent();
    }
    
    await renderChart(300);
    
    setTimeout(() => {
        const selector = document.getElementById('timeframeSelect');
        if (selector) {
            selector.addEventListener('change', (e) => renderChart(parseInt(e.target.value)));
        }
        
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.onclick = closeModal;
        }
    }, 100);
    
    modal.style.display = 'block';
}
