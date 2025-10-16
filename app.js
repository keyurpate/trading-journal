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
    
    // Modal close
    const modal = document.getElementById('chartModal');
    const closeBtn = document.querySelector('.close');
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    }
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
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
        
        const parsedTrades = [];
        let currentPosition = null;
        let exits = [];
        
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
        
        trades = [...trades, ...parsedTrades];
        localStorage.setItem('trades', JSON.stringify(trades));
        
        updateAccountFilter();
        loadTrades();
        
        alert('Successfully imported ' + parsedTrades.length + ' trades from ' + accounts.size + ' account(s)!');
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
    
    if (entry.instrument.includes('MES')) {
        pnl = pnl * 5;
    }
    
    return pnl;
}

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

function filterByAccount() {
    const selectedAccount = document.getElementById('accountFilter').value;
    loadTrades(selectedAccount);
}

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
    html += '<div class="stat-card"><h3>Total P&L</h3><p style="color: white">$' + stats.totalPnL.toFixed(2) + '</p></div>';
    html += '<div class="stat-card"><h3>Avg Win/Loss</h3><p>$' + stats.avgPnL.toFixed(2) + '</p></div>';
    html += '</div></div><div class="trades-section"><h2>Trade History</h2>';
    
    filteredTrades.forEach(trade => {
        html += '<div class="trade-card"><div class="trade-header"><div>';
        html += '<div class="trade-symbol">' + trade.symbol + '</div>';
        html += '<div style="color: #666; font-size: 14px;">' + trade.tradeType.toUpperCase() + ' | ' + trade.account + '</div></div>';
        html += '<div class="trade-pnl ' + (trade.pnl >= 0 ? 'profit' : 'loss') + '">' + (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) + '</div></div>';
        html += '<div class="trade-details"><div class="trade-detail">Entry<span>$' + trade.entryPrice.toFixed(2) + '</span><span style="font-size:12px;color:#94a3b8">' + new Date(trade.entryDate).toLocaleString() + '</span></div>';
        html += '<div class="trade-detail">Exit<span>$' + trade.exitPrice.toFixed(2) + '</span><span style="font-size:12px;color:#94a3b8">' + new Date(trade.exitDate).toLocaleString() + '</span></div>';
        html += '<div class="trade-detail">Quantity<span>' + trade.quantity + '</span></div></div>';
        if (trade.notes) {
            html += '<div style="margin-top: 10px; margin-bottom: 15px; font-size: 12px; color: #666; font-style: italic;">' + trade.notes + '</div>';
        }
        html += '<div class="button-group">';
        html += '<button class="view-chart-btn" onclick="viewChart(' + trade.id + ')">View Chart</button>';
        html += '<button class="delete-btn" onclick="deleteTrade(' + trade.id + ')">Delete</button>';
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
    return { totalTrades, winRate, totalPnL, avgPnL };
}

function deleteTrade(id) {
    if (confirm('Are you sure you want to delete this trade?')) {
        trades = trades.filter(t => t.id !== id);
        localStorage.setItem('trades', JSON.stringify(trades));
        updateAccountFilter();
        loadTrades();
    }
}

function viewChart(tradeId) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    
    const modal = document.getElementById('chartModal');
    const chartTitle = document.getElementById('chartTitle');
    const chartDiv = document.getElementById('tradeChart');
    
    chartTitle.innerHTML = trade.symbol + ' - ' + trade.tradeType.toUpperCase() + ' Trade <span style="float: right; font-size: 16px; margin-top: 5px;"><select id="timeframeSelect" style="padding: 8px 15px; border-radius: 8px; border: 2px solid #cbd5e1; background: white; cursor: pointer;"><option value="60">1 min</option><option value="300" selected>5 min</option><option value="900">15 min</option><option value="3600">1 hour</option><option value="14400">4 hour</option><option value="86400">Daily</option></select></span>';
    
    // Clear previous chart
    chartDiv.innerHTML = '';
    
    let currentChart = null;
    
    function renderChart(timeframe) {
        // Clear previous chart instance
        if (currentChart) {
            chartDiv.innerHTML = '';
        }
        
        // Create chart
        currentChart = LightweightCharts.createChart(chartDiv, {
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
                secondsVisible: false,
            },
        });

        // Generate candlestick data
        const entryPrice = trade.entryPrice;
        const exitPrice = trade.exitPrice;
        const priceRange = Math.abs(exitPrice - entryPrice);
        const buffer = priceRange * 0.5;
        
        const candleData = [];
        const volumeData = [];
        const ema9Data = [];
        const ema21Data = [];
        const sma200Data = [];
        
        const totalCandles = timeframe >= 3600 ? 100 : 50; // More candles for larger timeframes
        const entryIndex = Math.floor(totalCandles * 0.3);
        const exitIndex = Math.floor(totalCandles * 0.8);
        
        let currentPrice = entryPrice - buffer * 0.5;
        let ema9 = currentPrice;
        let ema21 = currentPrice;
        const smaWindow = [];
        
        for (let i = 0; i < totalCandles; i++) {
            const time = Math.floor(Date.now() / 1000) - (totalCandles - i) * timeframe;
            
            // Generate price movement
            if (i < entryIndex) {
                currentPrice += (Math.random() - 0.5) * (buffer * 0.1);
            } else if (i >= entryIndex && i < exitIndex) {
                const progress = (i - entryIndex) / (exitIndex - entryIndex);
                const targetPrice = entryPrice + (exitPrice - entryPrice) * progress;
                currentPrice = currentPrice * 0.7 + targetPrice * 0.3 + (Math.random() - 0.5) * (buffer * 0.05);
            } else {
                currentPrice += (Math.random() - 0.5) * (buffer * 0.1);
            }
            
            // Generate OHLC
            const volatility = priceRange * 0.02;
            const open = currentPrice + (Math.random() - 0.5) * volatility;
            const close = currentPrice + (Math.random() - 0.5) * volatility;
            const high = Math.max(open, close) + Math.random() * volatility;
            const low = Math.min(open, close) - Math.random() * volatility;
            
            candleData.push({
                time: time,
                open: open,
                high: high,
                low: low,
                close: close
            });
            
            // Generate volume
            volumeData.push({
                time: time,
                value: 1000 + Math.random() * 5000,
                color: close >= open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            });
            
            // Calculate 9 EMA
            const k9 = 2 / (9 + 1);
            ema9 = close * k9 + ema9 * (1 - k9);
            ema9Data.push({
                time: time,
                value: ema9
            });
            
            // Calculate 21 EMA
            const k21 = 2 / (21 + 1);
            ema21 = close * k21 + ema21 * (1 - k21);
            ema21Data.push({
                time: time,
                value: ema21
            });
            
            // Calculate 200 SMA
            smaWindow.push(close);
            if (smaWindow.length > 200) {
                smaWindow.shift();
            }
            if (i >= 199) {
                const sma200 = smaWindow.reduce((a, b) => a + b, 0) / smaWindow.length;
                sma200Data.push({
                    time: time,
                    value: sma200
                });
            }
            
            currentPrice = close;
        }
        
        // Add candlestick series
        const candleSeries = currentChart.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderUpColor: '#10b981',
            borderDownColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });
        candleSeries.setData(candleData);
        
        // Add 9 EMA line (purple)
        const ema9Series = currentChart.addLineSeries({
            color: '#8b5cf6',
            lineWidth: 2,
            title: '9 EMA',
        });
        ema9Series.setData(ema9Data);
        
        // Add 21 EMA line (orange)
        const ema21Series = currentChart.addLineSeries({
            color: '#f97316',
            lineWidth: 2,
            title: '21 EMA',
        });
        ema21Series.setData(ema21Data);
        
        // Add 200 SMA line (blue)
        if (sma200Data.length > 0) {
            const sma200Series = currentChart.addLineSeries({
                color: '#3b82f6',
                lineWidth: 2,
                title: '200 SMA',
            });
            sma200Series.setData(sma200Data);
        }
        
        // Add volume histogram
        const volumeSeries = currentChart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '',
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });
        volumeSeries.setData(volumeData);
        
        // Add entry/exit markers
        candleSeries.setMarkers([
            {
                time: candleData[entryIndex].time,
                position: trade.tradeType === 'long' ? 'belowBar' : 'aboveBar',
                color: trade.tradeType === 'long' ? '#10b981' : '#ef4444',
                shape: 'arrowUp',
                text: 'Entry: $' + entryPrice.toFixed(2),
            },
            {
                time: candleData[exitIndex].time,
                position: trade.tradeType === 'long' ? 'aboveBar' : 'belowBar',
                color: trade.pnl >= 0 ? '#10b981' : '#ef4444',
                shape: 'arrowDown',
                text: 'Exit: $' + exitPrice.toFixed(2) + ' (' + (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) + ')',
            }
        ]);
        
        // Fit content
        currentChart.timeScale().fitContent();
        
        // Handle window resize
        const resizeHandler = () => {
            currentChart.applyOptions({ width: chartDiv.clientWidth });
        };
        window.removeEventListener('resize', resizeHandler);
        window.addEventListener('resize', resizeHandler);
    }
    
    // Initial render with 5min timeframe
    renderChart(300);
    
    // Timeframe change handler
    setTimeout(() => {
        document.getElementById('timeframeSelect').addEventListener('change', function(e) {
            renderChart(parseInt(e.target.value));
        });
    }, 100);
    
    modal.style.display = 'block';
}
