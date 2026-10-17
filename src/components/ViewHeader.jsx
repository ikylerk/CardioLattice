import React from 'react'

export default function ViewHeader({ index, eyebrow, title, titleSuffix, description, meta, actions }) {
  return (
    <header className="view-header">
      <div className="view-heading">
        <span className="view-index">{index} / {eyebrow}</span>
        <div className="view-title-row">
          <h1>{title}{titleSuffix ? <em>{titleSuffix}</em> : null}</h1>
          {meta ? <div className="view-meta">{meta}</div> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="view-actions">{actions}</div> : null}
    </header>
  )
}
