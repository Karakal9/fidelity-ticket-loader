const express = require('express');
const cors = require('cors');
const { runTradeAutomation } = require('./automation');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Smart Utility to parse the tab-separated row regardless of column shifts
function parseSetupRow(row) {
    const columns = row.split('\t');
    if (columns.length < 10) {
        throw new Error('Invalid row format. Please copy a full row from your spreadsheet.');
    }

    const ticker = columns[1].trim();

    // Find all columns that contain price-like data ($)
    const priceData = columns
        .map((val, idx) => ({ val: val.trim(), idx }))
        .filter(item => item.val.includes('$'));

    if (priceData.length < 4) {
        throw new Error('Could not find enough price columns (Entry, Stop, Target, Current).');
    }

    // Mapping based on the spreadsheet structure:
    // Entry: 1st $ column (usually index 7)
    // Stop: 2nd $ column (usually index 8)
    // Target: 3rd $ column (usually index 10)
    // Current: 4th $ column (usually index 12)
    const entryPrice = parseFloat(priceData[0].val.replace(/[$,]/g, ''));
    const stopPrice = parseFloat(priceData[1].val.replace(/[$,]/g, ''));
    const currentPrice = parseFloat(priceData[3].val.replace(/[$,]/g, ''));

    // Shares is usually the first pure number after the Current Price column
    const currentPriceIdx = priceData[3].idx;
    let shares = 0;
    for (let i = currentPriceIdx + 1; i < columns.length; i++) {
        const val = columns[i].trim().replace(/,/g, '');
        // We look for a non-empty string that is a number and doesn't have extra symbols like $ or x
        if (val && !isNaN(val) && !val.includes('$') && !val.includes('x')) {
            shares = parseInt(val, 10);
            break;
        }
    }

    if (isNaN(entryPrice) || !shares) {
        throw new Error('Smart Parser failed to find Entry Price or Share count. Please check your row format.');
    }

    const targetPrice = priceData[2] ? parseFloat(priceData[2].val.replace(/[$,]/g, '')) : null;
    const stopLossPrice = priceData[1] ? parseFloat(priceData[1].val.replace(/[$,]/g, '')) : null;

    // Determine order type: 
    // If Entry > Current -> Stop Limit (we want to buy when it breaks above the entry)
    // Else -> Limit (we are buying at or below current price)
    let orderType = 'Limit';
    if (entryPrice > currentPrice) {
        orderType = 'Stop Limit';
    }

    // Calculate Limit Price (0.1% buffer for stop limits)
    const limitPrice = orderType === 'Stop Limit' ? (entryPrice * 1.001).toFixed(2) : entryPrice;

    return {
        ticker,
        quantity: shares,
        price: entryPrice,
        limitPrice,
        target: targetPrice,
        stopLoss: stopLossPrice,
        orderType,
        accountId: process.env.FIDELITY_ACCOUNT_ID
    };
}

app.post('/api/parse', (req, res) => {
    try {
        const { row } = req.body;
        const setup = parseSetupRow(row);
        res.json({ success: true, setup });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Serve static files from the public directory
app.use(express.static('public'));

// New route to show the floating entry ticket
app.get('/ticket', (req, res) => {
    res.sendFile(__dirname + '/public/ticket.html');
});

const { spawn } = require('child_process');

app.post('/api/trade', async (req, res) => {
    try {
        const { setup } = req.body;
        console.log('Spawning AI Agent for trade...', setup.ticker);
        
        // Use the Python virtual environment we just created
        const pythonProcess = spawn('./venv/bin/python3', [
            'ai_trader.py',
            JSON.stringify(setup)
        ]);

        pythonProcess.stdout.on('data', (data) => {
            console.log(`AI Agent: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`AI Agent Error: ${data}`);
        });

        res.json({ success: true, message: 'AI Agent dispatched. Watch your browser!' });
    } catch (error) {
        console.error('Failed to dispatch AI Agent:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
