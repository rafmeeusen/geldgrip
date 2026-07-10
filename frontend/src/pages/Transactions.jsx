import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client.js'
import CategoryPicker from '../components/CategoryPicker.jsx'
import ConfidenceBadge from '../components/ConfidenceBadge.jsx'

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  topbar: {
    background: '#fff', borderBottom: '0.5px solid #e0dfd8',
    padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 500, flex: 1 },
  stats: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
    padding: '14px 24px', background: '#fff', borderBottom: '0.5px solid #e0dfd8', flexShrink: 0,
  },
  stat: { background: '#f5f4f0', borderRadius: 8, padding: '10px 14px' },
  statLabel: { fontSize: 11, color: '#888780', marginBottom: 3 },
  statValue: { fontSize: 20, fontWeight: 500 },
  scroll: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  sectionHead: {
    fontSize: 11, fontWeight: 500, color: '#888780', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10,
  },
  badge: { background: '#FAEEDA', color: '#633806', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
  commitBtn: { marginLeft: 'auto', fontSize: 12, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 },
  th: { textAlign: 'left', padding: '6px 10px', color: '#888780', fontWeight: 500, fontSize: 11, borderBottom: '0.5px solid #e0dfd8' },
  td: { padding: '10px 10px', borderBottom: '0.5px solid #e0dfd8', verticalAlign: 'middle' },
  pendingRow: { background: '#FAEEDA18' },
  desc: { fontSize: 13 },
  descSub: { fontSize: 11, color: '#888780', marginTop: 2 },
  amountNeg: { color: '#A32D2D', fontVariantNumeric: 'tabular-nums' },
  amountPos: { color: '#0F6E56', fontVariantNumeric: 'tabular-nums' },
  actionBtn: {
    fontSize: 11, padding: '4px 9px', borderRadius: 6,
    border: '0.5px solid #d3d1c7', background: '#fff', color: '#888780', cursor: 'pointer', marginRight: 4,
  },
  approveBtn: {
    fontSize: 11, padding: '4px 9px', borderRadius: 6,
    border: '0.5px solid #1D9E75', background: '#fff', color: '#0F6E56', cursor: 'pointer', marginRight: 4,
  },
  filterRow: { display: 'flex', gap: 8, alignItems: 'center' },
  select: { padding: '6px 10px', borderRadius: 7, border: '0.5px solid #d3d1c7', fontSize: 13, background: '#fff' },
  warnBanner: {
    background: '#FDEEEA', border: '0.5px solid #F0C4B4', borderRadius: 10,
    padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#8A3B1E',
  },
  warnHead: { display: 'flex', alignItems: 'center', gap: 10 },
  warnToggle: { marginLeft: 'auto', fontSize: 12, color: '#8A3B1E', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 },
  warnDismiss: { fontSize: 12, color: '#8A3B1E', cursor: 'pointer', background: 'none', border: 'none', padding: 0 },
  warnRows: { marginTop: 10, fontSize: 12, fontFamily: 'ui-monospace, monospace', maxHeight: 160, overflowY: 'auto', background: '#fff', borderRadius: 6, padding: '8px 10px' },
  similarBanner: {
    background: '#E9F5F0', border: '0.5px solid #B7DFCE', borderRadius: 10,
    padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#0F6E56',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  similarActions: { marginLeft: 'auto', display: 'flex', gap: 8 },
  applyBtn: { fontSize: 12, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 500 },
  dismissBtn: { fontSize: 12, padding: '5px 12px', borderRadius: 7, border: '0.5px solid #B7DFCE', background: '#fff', color: '#0F6E56', cursor: 'pointer' },
  conflictWarn: { fontSize: 11, color: '#A32D2D', marginTop: 2 },
}

function fmt(amount) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(amount)
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

const REASON_LABELS = {
  missing_amount_or_date: 'missing amount or date',
  unparseable_amount: 'unreadable amount',
  zero_amount: 'zero amount',
  unparseable_date: 'unreadable date',
}

export default function Transactions({ onPendingChange, uploadResult, onDismissUploadResult }) {
  const [txs, setTxs] = useState([])
  const [stats, setStats] = useState({ income: 0, expenses: 0, balance: 0, pending: 0 })
  const [categories, setCategories] = useState([])
  const [month, setMonth] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [similarBanner, setSimilarBanner] = useState(null)
  const [conflicts, setConflicts] = useState({})
  const [droppedExpanded, setDroppedExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = { is_approved: false }
    if (month) params.month = month
    const [txData, statsData, cats] = await Promise.all([
      api.getTransactions(params),
      api.getStats(month),
      api.getCategories(),
    ])
    setTxs(txData)
    setStats(statsData)
    setCategories(cats)
    onPendingChange?.(statsData.pending)
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('refresh-transactions', handler)
    return () => window.removeEventListener('refresh-transactions', handler)
  }, [load])

  function handleSimilar(tx) {
    if (tx.similar_pending && tx.similar_pending.length > 0) {
      setSimilarBanner({
        forTxId: tx.id,
        categoryId: tx.category_id,
        categoryName: tx.category?.name,
        counterparty: tx.counterparty,
        matches: tx.similar_pending,
      })
    }
  }

  async function acceptSuggestion(tx) {
    const updated = await api.acceptSuggestion(tx.id)
    handleSimilar(updated)
    await load()
  }

  async function setCategory(txId, catId) {
    const updated = await api.updateTransaction(txId, { category_id: catId })
    setEditingId(null)
    handleSimilar(updated)
    await load()
  }

  async function applyToAll() {
    if (!similarBanner) return
    const ids = similarBanner.matches.map(m => m.id)
    const result = await api.bulkCategorize(ids, similarBanner.categoryId)
    const newConflicts = {}
    for (const t of result.conflicting) {
      newConflicts[t.id] = t.suggested_category?.name || 'another category'
    }
    setConflicts(prev => ({ ...prev, ...newConflicts }))
    setSimilarBanner(null)
    await load()
  }

  async function commitReviewed() {
    await api.commitReviewed()
    setConflicts({})
    await load()
  }

  const ready = txs.filter(t => t.category_id)
  const needsReview = txs.filter(t => !t.category_id)

  const months = [...new Set(txs.map(t => t.date.slice(0, 7)))].sort().reverse()

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.title}>Transactions</div>
        <div style={S.filterRow}>
          <select style={S.select} value={month} onChange={e => setMonth(e.target.value)}>
            <option value="">All months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div style={S.stats}>
        <div style={S.stat}>
          <div style={S.statLabel}>Income</div>
          <div style={{ ...S.statValue, color: '#0F6E56' }}>{fmt(stats.income)}</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Expenses</div>
          <div style={{ ...S.statValue, color: '#A32D2D' }}>{fmt(stats.expenses)}</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Balance</div>
          <div style={S.statValue}>{fmt(stats.balance)}</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>To review</div>
          <div style={{ ...S.statValue, color: '#854F0B' }}>{stats.pending}</div>
        </div>
      </div>

      <div style={S.scroll}>
        {uploadResult && uploadResult.dropped > 0 && (
          <div style={S.warnBanner}>
            <div style={S.warnHead}>
              <span>⚠ {uploadResult.dropped} row{uploadResult.dropped === 1 ? '' : 's'} couldn't be imported
                {' '}({Object.entries(uploadResult.dropped_reasons).map(([r, n]) => `${n} ${REASON_LABELS[r] || r}`).join(', ')})
              </span>
              <button style={S.warnToggle} onClick={() => setDroppedExpanded(x => !x)}>
                {droppedExpanded ? 'Hide rows' : 'Show rows'}
              </button>
              <button style={S.warnDismiss} onClick={onDismissUploadResult}>Dismiss</button>
            </div>
            {droppedExpanded && (
              <div style={S.warnRows}>
                {uploadResult.dropped_rows.map((d, i) => (
                  <div key={i}>[{d.reason}] {JSON.stringify(d.raw_row)}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && <div style={{ color: '#888780', fontSize: 13, padding: '20px 0' }}>Loading…</div>}

        {!loading && ready.length > 0 && (
          <>
            <div style={S.sectionHead}>
              Ready to commit <span style={S.badge}>{ready.length}</span>
              <button style={S.commitBtn} onClick={commitReviewed}>Approve</button>
            </div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Description</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Category</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {ready.map(tx => (
                  <tr key={tx.id}>
                    <td style={{ ...S.td, color: '#888780', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(tx.date)}</td>
                    <td style={S.td}>
                      <div style={S.desc}>{tx.description}</div>
                      {tx.counterparty && <div style={S.descSub}>{tx.counterparty}</div>}
                    </td>
                    <td style={{ ...S.td, ...(tx.amount < 0 ? S.amountNeg : S.amountPos), whiteSpace: 'nowrap' }}>
                      {fmt(tx.amount)}
                    </td>
                    <td style={S.td}>
                      {editingId === tx.id ? (
                        <CategoryPicker
                          categories={categories}
                          value={tx.category_id}
                          onChange={catId => setCategory(tx.id, catId)}
                          onClose={() => setEditingId(null)}
                        />
                      ) : (
                        <CategoryChip cat={tx.category} />
                      )}
                    </td>
                    <td style={S.td}>
                      <button style={S.actionBtn} onClick={() => setEditingId(editingId === tx.id ? null : tx.id)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {similarBanner && (
          <div style={S.similarBanner}>
            <span>
              {similarBanner.matches.length} other pending transaction{similarBanner.matches.length === 1 ? '' : 's'} from
              {' '}<strong>{similarBanner.counterparty}</strong> — apply <strong>{similarBanner.categoryName}</strong> to all of them too?
            </span>
            <div style={S.similarActions}>
              <button style={S.applyBtn} onClick={applyToAll}>Apply to all</button>
              <button style={S.dismissBtn} onClick={() => setSimilarBanner(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {!loading && needsReview.length > 0 && (
          <>
            <div style={S.sectionHead}>
              Needs review <span style={S.badge}>{needsReview.length} pending</span>
            </div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Description</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Suggested category</th>
                  <th style={S.th}>Confidence</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {needsReview.map(tx => (
                  <tr key={tx.id} style={S.pendingRow}>
                    <td style={{ ...S.td, color: '#888780', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(tx.date)}</td>
                    <td style={S.td}>
                      <div style={S.desc}>{tx.description}</div>
                      {tx.counterparty && <div style={S.descSub}>{tx.counterparty}</div>}
                      {conflicts[tx.id] && (
                        <div style={S.conflictWarn}>⚠ previously suggested: {conflicts[tx.id]}</div>
                      )}
                    </td>
                    <td style={{ ...S.td, ...(tx.amount < 0 ? S.amountNeg : S.amountPos), whiteSpace: 'nowrap' }}>
                      {fmt(tx.amount)}
                    </td>
                    <td style={S.td}>
                      {editingId === tx.id ? (
                        <CategoryPicker
                          categories={categories}
                          value={tx.suggested_category_id}
                          onChange={catId => setCategory(tx.id, catId)}
                          onClose={() => setEditingId(null)}
                        />
                      ) : (
                        <CategoryChip cat={tx.suggested_category} pending />
                      )}
                    </td>
                    <td style={S.td}>
                      <ConfidenceBadge value={tx.suggested_confidence} />
                    </td>
                    <td style={S.td}>
                      <button
                        style={{ ...S.approveBtn, ...(tx.suggested_category_id ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}
                        onClick={() => acceptSuggestion(tx)}
                        disabled={!tx.suggested_category_id}
                      >✓</button>
                      <button style={S.actionBtn} onClick={() => setEditingId(editingId === tx.id ? null : tx.id)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!loading && txs.length === 0 && !(uploadResult && uploadResult.dropped > 0) && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888780' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>↑</div>
            <div style={{ fontSize: 14 }}>Nothing to review — upload a KBC CSV file to get started</div>
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryChip({ cat, pending }) {
  if (!cat) {
    return (
      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: '#FAEEDA', color: '#633806', fontWeight: 500 }}>
        ? Uncategorized
      </span>
    )
  }
  return (
    <span style={{
      fontSize: 12, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
      background: cat.color + '22', color: cat.color,
      border: pending ? `1px dashed ${cat.color}66` : 'none',
    }}>
      {pending ? '? ' : ''}{cat.name}
    </span>
  )
}
