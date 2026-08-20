'use client'

import { useState, useRef, useCallback } from 'react'

interface EditableCellProps {
  value: number
  onChange: (val: number) => void
  className?: string
}

export default function EditableCell({ 
  value, 
  onChange, 
  className = ''
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setLocalVal(value === 0 ? '' : String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = useCallback(() => {
    const parsed = parseFloat(localVal)
    onChange(isNaN(parsed) ? 0 : parsed)
    setEditing(false)
  }, [localVal, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className={`cell-input ${className}`}
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        min={0}
        step={0.5}
      />
    )
  }

  return (
    <span
      className={`cursor-pointer hover:bg-blue-50 rounded px-1.5 py-0.5 font-medium text-gray-900 ${className}`}
      onClick={startEdit}
      title="Clique para editar"
    >
      {value === 0 ? '0' : value}
    </span>
  )
}
