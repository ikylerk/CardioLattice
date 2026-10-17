import React from 'react'
import { ChevronDown } from 'lucide-react'

export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

export function Button({ variant = 'ghost', size = 'md', icon, children, className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...props}>
      {icon ? <span className="btn-icon">{icon}</span> : null}
      {children}
    </button>
  )
}

export function Segmented({ options, value, onChange, className = '', ariaLabel }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option
        return (
          <button
            key={item.value}
            className={item.value === value ? 'active' : ''}
            onClick={() => onChange(item.value)}
            type="button"
          >
            {item.label}
            {item.sub ? <small>{item.sub}</small> : null}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, format, ticks, className = '' }) {
  const display = format ? format(value) : `${value}${unit}`
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={`slider-control ${className}`}>
      <div className="slider-head">
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        style={{ '--fill': `${pct}%` }}
      />
      {ticks ? (
        <div className="slider-ticks">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <span>
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </label>
  )
}

export function Section({ title, code, right, children, className = '', open = true }) {
  return (
    <section className={`inspector-section ${className}`}>
      <header>
        <div className="section-title">
          <span>{title}</span>
          {code ? <em>{code}</em> : null}
        </div>
        {right}
      </header>
      {open ? <div className="section-body">{children}</div> : null}
    </section>
  )
}

export function Collapsible({ title, code, children, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className={`collapsible ${open ? 'open' : ''}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        <span>
          {title} {code ? <em>{code}</em> : null}
        </span>
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>
      {open ? <div className="collapsible-body">{children}</div> : null}
    </div>
  )
}

export function Stat({ label, value, unit, accent, hint }) {
  return (
    <div className={`stat ${accent ? `accent-${accent}` : ''}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', dot = false }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <i /> : null}
      {children}
    </span>
  )
}

export function Kbd({ children }) {
  return <kbd>{children}</kbd>
}

export function Divider({ label }) {
  return <div className="hr-label">{label ? <span>{label}</span> : null}</div>
}
