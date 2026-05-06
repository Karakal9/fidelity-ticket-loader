import React, { useState, useEffect } from 'react';

function App() {
  const [rowInput, setRowInput] = useState('');
  const [setup, setSetup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState(null);

  const handleInputChange = async (e) => {
    const val = e.target.value;
    setRowInput(val);
    setError(null);

    if (val.trim()) {
      try {
        const response = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ row: val })
        });
        const data = await response.json();
        if (data.success) {
          setSetup(data.setup);
          setStatus('Ready');
        } else {
          setError(data.error);
          setSetup(null);
          setStatus('Waiting for valid data...');
        }
      } catch (err) {
        setError('Connection to backend failed');
      }
    } else {
      setSetup(null);
      setStatus('Idle');
    }
  };

  const launchTrade = async () => {
    if (!setup) return;
    setLoading(true);
    setStatus('Launching Automation...');
    try {
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup })
      });
      const data = await response.json();
      if (data.success) {
        setStatus('Browser Opened! Check Fidelity.');
      } else {
        setError(data.error);
        setStatus('Failed to launch');
      }
    } catch (err) {
      setError('Failed to trigger automation');
      setStatus('Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Fidelity AutoTicker</h1>
        <p>Paste your entry row to automate position opening</p>
      </div>

      <div className="input-section">
        <textarea
          placeholder="Paste row here... (Date	Ticker	Company...)"
          value={rowInput}
          onChange={handleInputChange}
          autoFocus
        />

        {error && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</div>}

        <div className={`preview-card ${setup ? 'visible' : ''}`}>
          <div className="data-item">
            <span className="data-label">Ticker</span>
            <span className="data-value">{setup?.ticker || '-'}</span>
          </div>
          <div className="data-item">
            <span className="data-label">Quantity</span>
            <span className="data-value">{setup?.quantity || '-'}</span>
          </div>
          <div className="data-item">
            <span className="data-label">Entry Price</span>
            <span className="data-value">${setup?.price?.toFixed(2) || '-'}</span>
          </div>
          <div className="data-item">
            <span className="data-label">Account</span>
            <span className="data-value">ROTH IRA (***{setup?.accountId?.slice(-3)})</span>
          </div>
        </div>

        <div className="actions">
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>
            <span className={`status-badge ${setup ? 'status-ready' : 'status-pending'}`}>
              {status}
            </span>
          </div>
          <button 
            onClick={launchTrade} 
            disabled={!setup || loading}
            className={setup && !loading ? 'btn-animate' : ''}
          >
            {loading ? 'Processing...' : 'Initialize Trade'}
          </button>
        </div>
      </div>
      
      <div style={{ marginTop: '2rem', fontSize: '0.7rem', color: '#64748b', textAlign: 'center' }}>
        System will fill the trade ticket in Chrome. Final submission is manual.
      </div>
    </div>
  );
}

export default App;
