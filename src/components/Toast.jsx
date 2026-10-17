import React from 'react'
import { CheckCircle2 } from 'lucide-react'

export default function Toast({ message }) {
  if (!message) return null
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={15} />
      {message}
    </div>
  )
}
