/**
 * A section header in lukeghanna.com's style: the label, a mono index, then a
 * hairline running to the edge. Anything passed as children sits after the
 * rule (the player page's Die and Spike column headings), outside the
 * heading, so the heading's name is just the label.
 */
export function SectionRule({
  label,
  index,
  as: Tag = 'h2',
  labelClassName = '',
  className = '',
  children,
}: {
  label: React.ReactNode
  index?: string
  as?: 'h2' | 'div'
  labelClassName?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Tag className={`eyebrow ${labelClassName}`}>{label}</Tag>
      {index && <span className="font-mono text-[11px] text-faint">{index}</span>}
      <span aria-hidden="true" className="h-px flex-1 bg-fg/9" />
      {children}
    </div>
  )
}
