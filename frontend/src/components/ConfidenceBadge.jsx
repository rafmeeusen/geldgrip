import React from 'react'

export default function ConfidenceBadge({ value }) {
  if (value === null || value === undefined) {
    return <span style={{ fontSize: 11, color: '#888780' }}>—</span>
  }

  const pct = Math.round(value * 100)
  const color = pct >= 80 ? '#1D9E75' : pct >= 50 ? '#EF9F27' : '#E24B4A'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 4, background: '#f5f4f0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: '#888780', minWidth: 28 }}>{pct}%</span>
    </div>
  )
}
