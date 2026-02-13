import { useState } from 'react';

export default function MarketplacePanel() {
  const [tab, setTab] = useState<'browse' | 'my-cores' | 'sell' | 'extensions' | 'community'>('browse');

  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse</button>
        <button className={`sg-tab ${tab === 'my-cores' ? 'active' : ''}`} onClick={() => setTab('my-cores')}>My Cores</button>
        <button className={`sg-tab ${tab === 'sell' ? 'active' : ''}`} onClick={() => setTab('sell')}>Sell</button>
        <button className={`sg-tab ${tab === 'extensions' ? 'active' : ''}`} onClick={() => setTab('extensions')}>Extensions</button>
        <button className={`sg-tab ${tab === 'community' ? 'active' : ''}`} onClick={() => setTab('community')}>Community</button>
      </div>

      <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
        {tab === 'browse' && 'No cores available in marketplace yet'}
        {tab === 'my-cores' && 'You have no purchased cores'}
        {tab === 'sell' && 'Core selling \u2014 coming soon'}
        {tab === 'extensions' && 'Browse community extensions \u2014 coming soon'}
        {tab === 'community' && 'Community contributions \u2014 coming soon'}
      </div>
    </div>
  );
}
