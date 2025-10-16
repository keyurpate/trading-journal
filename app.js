// Data storage
let trades = JSON.parse(localStorage.getItem('trades')) || [];
let accounts = new Set();
let polygonApiKey = localStorage.getItem('polygonApiKey') || 'e329C3pUBVi1hwvO3WZKFd45kh9Bt5fn';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadTrades();
    setupEventListeners();
    loadApiKey();
    
    // Auto-save the API key if not already saved
    if (!localStorage.getItem('polygonApiKey')) {
        localStorage.setItem('polygonApiKey', polygonApiKey);
    }
});

function setupEventListeners() {
    document.getElementById('importCsvButton').addEventListener('click', importCsv);
    document.getElementById('accountFilter').addEventListener('change', filterByAccount);
    document.getElementById('saveApiKeyButton').addEventListener('click', saveApiKey);
    
    // Modal close - FIXED
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
        alert('API Key saved successfully! You can now view real market data charts.');
    } else {
        alert('Please enter a valid API key.');
    }
}

// CSV Import Function
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

// Convert NinjaTrader symbol to Polygon.io ticker
function getPolygonTicker(symbol) {
    if (symbol.includes('MES')) return 'I:MES';
    if (symbol.includes('ES')) return 'I:ES';
    if (symbol.includes('NQ')) return 'I:NQ';
    if (symbol.includes('YM')) return 'I:YM';
    if (symbol.includes('RTY')) return 'I:RTY';
    return symbol.split(' ')[0];
}

// Fetch REAL market data from Polygon.io
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
    else if (timeframe === 14400) { multiplier = 4; timespan = 'hour'; }
    else if (timeframe === 86400) { multiplier = 1; timespan = 'day'; }
    
    const from = new Date(startDate).toISOString().split('T')[0];
    const to = new Date(endDate).toISOString().split('T')[0];
    
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${polygonApiKey}`;
    
    console.log('Fetching real market data:', url.replace(polygonApiKey, 'API_KEY'));
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            console.log(`✅ Fetched ${data.results.length} real candles from Polygon.io`);
            return data.results.map(candle => ({
                time: Math.floor(candle.t / 1000),
                open: candle.o,
                high: candle.h,
                low: candle.l,
                close: candle.c,
                volume: candle.v
            }));
        } else {
            console.warn('No data from API:', data.status || data.message);
            return null;
        }
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

// Fallback: Generate realistic simulated data
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
    const tickSize = symbol.includes('MES') ? 0.25 : 0.01;
    
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
    const modal = document.getElementById('chartModal');
    modal.style.display = 'none';
}

async function viewChart(tradeId) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    
    const modal = document.getElementById('chartModal');
    const chartTitle = document.getElementById('chartTitle');
    const chartDiv = document.getElementById('tradeChart');
    
    // Add close button that works
    chartTitle.innerHTML = trade.symbol + ' - ' + trade.tradeType.toUpperCase() + ' Trade <span style="float: right; font-size: 16px; margin-top: 5px;"><select id="timeframeSelect"><option value="60">1 min</option><option value="300" selected>5 min</option><option value="900">15 min</option><option value="3600">1 hour</option></select></span>';
    
    chartDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#667eea;"><div style="font-size:18px;margin-bottom:10px;">🔄 Loading REAL market data...</div><div style="font-size:14px;color:#94a3b8;">Fetching candles from Polygon.io</div></div>';
    
    let chartInstance = null;
    
    async function renderChart(timeframe) {
        if (chartInstance) {
            chartDiv.innerHTML = '';
        }
        
        chartDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#667eea;">🔄 Loading...</div>';
        
        const entryDate = new Date(trade.entryDate);
        const exitDate = new Date(trade.exitDate);
        const tradeDuration = exitDate - entryDate;
        
        const startDate = new Date(entryDate.getTime() - tradeDuration * 0.5);
        const endDate = new Date(exitDate.getTime() + tradeDuration * 0.5);
        
        console.log('Trade Entry:', entryDate.toLocaleString());
        console.log('Trade Exit:', exitDate.toLocaleString());
        console.log('Fetching data from:', startDate.toLocaleString(), 'to', endDate.toLocaleString());
        
        let candleData = await fetchRealMarketData(trade.symbol, startDate, endDate, timeframe);
        
        if (!candleData || candleData.length === 0) {
            console.log('⚠️ Using simulated data (API returned no data)');
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
        const volumeData = [];
        
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
            
            volumeData.push({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            });
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
        
        // FIXED: Volume only 8% of chart height
        const volumeSeries = chartInstance.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            scaleMargins: { 
                top: 0.92,  // Volume takes only bottom 8%
                bottom: 0 
            },
        });
        volumeSeries.setData(volumeData);
        
        // FIXED: Use EXACT entry/exit times from CSV
        const entryTimestamp = Math.floor(new Date(trade.entryDate).getTime() / 1000);
        const exitTimestamp = Math.floor(new Date(trade.exitDate).getTime() / 1000);
        
        console.log('Entry marker at:', new Date(entryTimestamp * 1000).toLocaleString());
        console.log('Exit marker at:', new Date(exitTimestamp * 1000).toLocaleString());
        
        // Find closest candles to entry/exit times
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
                text: 'Exit: $' + trade.exitPrice.toFixed(2) + ' (P&L: $' + trade.pnl.toFixed(2) + ')',
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
        
        // Re-attach close button handler
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.onclick = function() {
                closeModal();
            }
        }
    }, 100);
    
    modal.style.display = 'block';
}
