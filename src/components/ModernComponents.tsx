import React, { ReactNode } from 'react'

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  loading?: boolean
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  disabled,
  ...props
}) => {
  const baseStyles = 'font-semibold rounded-lg transition inline-flex items-center gap-2'

  const variantStyles = {
    primary: 'bg-purple-600 hover:bg-purple-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    ghost: 'bg-transparent hover:bg-slate-800 text-white border border-slate-700',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  }

  const sizeStyles = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

// ============================================================================
// CARD COMPONENT
// ============================================================================

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
}

export const Card: React.FC<CardProps> = ({ children, hover = true, className = '', ...props }) => (
  <div
    className={`backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 ${
      hover ? 'hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 transition' : ''
    } ${className}`}
    {...props}
  >
    {children}
  </div>
)

// ============================================================================
// INPUT COMPONENT
// ============================================================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  success?: boolean
  label?: string
}

export const Input: React.FC<InputProps> = ({ error, success, label, className = '', ...props }) => (
  <div>
    {label && <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>}
    <input
      className={`w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent transition ${
        error
          ? 'border-red-500/50 focus:ring-red-500'
          : success
            ? 'border-green-500/50 focus:ring-green-500'
            : 'border-slate-700 focus:ring-purple-500'
      } ${className}`}
      {...props}
    />
  </div>
)

// ============================================================================
// BADGE COMPONENT
// ============================================================================

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
  const variantStyles = {
    default: 'bg-gray-500/20 text-gray-300',
    success: 'bg-green-500/20 text-green-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    danger: 'bg-red-500/20 text-red-400',
    info: 'bg-blue-500/20 text-blue-400',
  }

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${variantStyles[variant]}`}>
      {children}
    </span>
  )
}

// ============================================================================
// ALERT COMPONENT
// ============================================================================

type AlertType = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  type?: AlertType
  title?: string
  children: ReactNode
  onClose?: () => void
}

export const Alert: React.FC<AlertProps> = ({ type = 'info', title, children, onClose }) => {
  const typeStyles = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    success: 'bg-green-500/10 border-green-500/30 text-green-300',
    warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
    error: 'bg-red-500/10 border-red-500/30 text-red-300',
  }

  return (
    <div className={`p-4 border rounded-lg ${typeStyles[type]}`}>
      <div className="flex items-start justify-between">
        <div>
          {title && <p className="font-semibold mb-1">{title}</p>}
          <p className="text-sm">{children}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-lg leading-none hover:opacity-70 transition">
            ×
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KPICardProps {
  label: string
  value: string | number
  trend?: { value: number; direction: 'up' | 'down' }
  icon?: string
  color?: 'purple' | 'green' | 'blue' | 'amber'
}

export const KPICard: React.FC<KPICardProps> = ({ label, value, trend, icon, color = 'purple' }) => {
  const colorStyles = {
    purple: 'border-purple-500/30 hover:border-purple-500/50 text-purple-400',
    green: 'border-green-500/30 hover:border-green-500/50 text-green-400',
    blue: 'border-blue-500/30 hover:border-blue-500/50 text-blue-400',
    amber: 'border-amber-500/30 hover:border-amber-500/50 text-amber-400',
  }

  return (
    <Card className={`${colorStyles[color]} transition`}>
      <div className="flex items-start justify-between mb-3">
        {icon && <span className="text-2xl">{icon}</span>}
        {trend && (
          <span className={`text-sm font-semibold ${trend.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}%
          </span>
        )}
      </div>
      <p className="text-gray-400 text-sm font-medium mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </Card>
  )
}

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  color?: 'purple' | 'green' | 'blue' | 'red'
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, max = 100, label, color = 'purple' }) => {
  const colorStyles = {
    purple: 'bg-gradient-to-r from-purple-500 to-blue-500',
    green: 'bg-gradient-to-r from-green-500 to-emerald-500',
    blue: 'bg-gradient-to-r from-blue-500 to-cyan-500',
    red: 'bg-gradient-to-r from-red-500 to-pink-500',
  }

  const percentage = (value / max) * 100

  return (
    <div>
      {label && (
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">{label}</span>
          <span className="text-sm font-semibold text-gray-400">
            {value} / {max}
          </span>
        </div>
      )}
      <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorStyles[color]} transition-all duration-500`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// MODAL COMPONENT
// ============================================================================

interface ModalProps {
  isOpen: boolean
  title?: string
  children: ReactNode
  onClose: () => void
  size?: 'sm' | 'md' | 'lg'
}

export const Modal: React.FC<ModalProps> = ({ isOpen, title, children, onClose, size = 'md' }) => {
  if (!isOpen) return null

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full bg-gradient-to-t from-slate-900 via-slate-800 to-slate-900 border-t border-slate-700/50 rounded-t-3xl p-6 md:p-8 max-h-[80vh] overflow-y-auto ${sizeStyles[size]}`}
      >
        {title && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ============================================================================
// TABS COMPONENT
// ============================================================================

interface Tab {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab }) => {
  const [activeTab, setActiveTab] = React.useState(defaultTab || tabs[0]?.id)

  return (
    <div>
      <div className="flex gap-2 border-b border-slate-700/50 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-medium transition relative ${
              activeTab === tab.id
                ? 'text-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-blue-500" />
            )}
          </button>
        ))}
      </div>
      <div>{tabs.find((tab) => tab.id === activeTab)?.content}</div>
    </div>
  )
}

// ============================================================================
// STAT GROUP COMPONENT
// ============================================================================

interface StatItem {
  label: string
  value: string | number
  change?: { value: number; direction: 'up' | 'down' }
}

interface StatGroupProps {
  stats: StatItem[]
}

export const StatGroup: React.FC<StatGroupProps> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {stats.map((stat, idx) => (
      <Card key={idx} hover={false} className="text-center">
        <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
        <p className="text-2xl font-bold text-white mb-2">{stat.value}</p>
        {stat.change && (
          <span className={`text-xs font-semibold ${stat.change.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
            {stat.change.direction === 'up' ? '↑' : '↓'} {stat.change.value}%
          </span>
        )}
      </Card>
    ))}
  </div>
)

// ============================================================================
// TIMELINE COMPONENT
// ============================================================================

interface TimelineEvent {
  date: string
  title: string
  description?: string
  status?: 'completed' | 'pending' | 'failed'
}

interface TimelineProps {
  events: TimelineEvent[]
}

export const Timeline: React.FC<TimelineProps> = ({ events }) => (
  <div className="relative">
    {events.map((event, idx) => (
      <div key={idx} className="flex gap-4 pb-6">
        <div className="flex flex-col items-center">
          <div
            className={`w-4 h-4 rounded-full ${
              event.status === 'completed'
                ? 'bg-green-500'
                : event.status === 'failed'
                  ? 'bg-red-500'
                  : 'bg-gray-500'
            }`}
          />
          {idx < events.length - 1 && <div className="w-1 h-12 bg-slate-700 mt-2" />}
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium">{event.date}</p>
          <p className="text-white font-semibold">{event.title}</p>
          {event.description && <p className="text-sm text-gray-400 mt-1">{event.description}</p>}
        </div>
      </div>
    ))}
  </div>
)
