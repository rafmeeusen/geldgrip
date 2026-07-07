import React, { useEffect, useRef } from 'react'

const S = {
  wrap: { position: 'relative', display: 'inline-block' },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, zIndex: 50,
    background: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.10)', minWidth: 200, maxHeight: 240,
    overflowY: 'auto', marginTop: 4,
  },
  item: {
    padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex',
    alignItems: 'center', gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
}

export default function CategoryPicker({ categories, value, onChange, onClose }) {
  const ref = useRef()

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div style={S.wrap} ref={ref}>
      <div style={S.dropdown}>
        {categories.map(cat => (
          <div
            key={cat.id}
            style={{
              ...S.item,
              background: cat.id === value ? '#f5f4f0' : 'transparent',
              fontWeight: cat.id === value ? 500 : 400,
            }}
            onClick={() => onChange(cat.id)}
          >
            <div style={{ ...S.dot, background: cat.color }} />
            {cat.name}
          </div>
        ))}
        {categories.length === 0 && (
          <div style={{ padding: '12px 14px', fontSize: 13, color: '#888780' }}>
            No categories yet
          </div>
        )}
      </div>
    </div>
  )
}
