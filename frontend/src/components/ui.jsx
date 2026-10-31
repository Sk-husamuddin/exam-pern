import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  FileSpreadsheet,
  FileText,
  Fullscreen,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MonitorCheck,
  ShieldCheck,
  Users,
  X,
  Eye,
  EyeOff,
  LoaderCircle,
} from 'lucide-react';
import Clock from './ui/clock';

export const Logo = ({ compact = false }) => (
  <a href="/" className="brand" aria-label="Smart Exam Platform home">
    <span className="brand-mark">
      <ShieldCheck size={19} />
    </span>
    {!compact && (
      <span>
        Smart Exam <b>Platform</b>
      </span>
    )}
  </a>
);

export function Button({
  children,
  variant = 'primary',
  href,
  onClick,
  type = 'button',
  loading = false,
  icon: IconComponent,
  className = '',
}) {
  const content = (
    <>
      {loading ? (
        <Clock size={16} color={variant === 'secondary' ? '#000000' : '#FFFFFF'} />
      ) : IconComponent ? (
        <IconComponent size={17} />
      ) : null}
      <span>{loading ? 'Please wait…' : children}</span>
    </>
  );
  return href ? (
    <a href={href} className={`btn btn-${variant} ${className}`}>
      {content}
    </a>
  ) : (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className={`btn btn-${variant} ${className}`}
    >
      {content}
    </button>
  );
}

export function StatusBadge({ status }) {
  const labels = {
    live: 'Live now',
    draft: 'Draft',
    ended: 'Ended',
    locked: 'Locked',
    online: 'Online',
    offline: 'Offline',
  };
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" />
      {labels[status] || status}
    </span>
  );
}

export function FormField({ label, id, error, hint, children }) {
  return (
    <div className={`field ${error ? 'field-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="error-text">{error}</span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function AppShell({ children, title = 'Workspace' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Logo />
          <button
            className="icon-btn mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="active" href="#">
            <LayoutDashboard size={17} />
            Overview
          </a>
          <a href="#">
            <FileText size={17} />
            Exams
          </a>
          <a href="#">
            <Users size={17} />
            Students
          </a>
          <a href="#">
            <MonitorCheck size={17} />
            Live monitor
          </a>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">JS</div>
          <div>
            <strong>Dr. Jane Smith</strong>
            <span>Faculty account</span>
          </div>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <button
            className="icon-btn mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="topbar-title">{title}</span>
          <div className="topbar-actions">
            <button className="icon-btn" aria-label="Toggle dark mode">
              ◐
            </button>
            <div className="avatar avatar-sm">JS</div>
          </div>
        </header>
        <main className="shell-content">{children}</main>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          <a className="active" href="#">
            <LayoutDashboard size={18} />
            <span>Home</span>
          </a>
          <a href="#">
            <FileText size={18} />
            <span>Exams</span>
          </a>
          <a href="#">
            <Users size={18} />
            <span>Students</span>
          </a>
        </nav>
      </div>
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div className="skeleton-page">
      <div className="skeleton-logo skeleton" />
      <div className="skeleton skeleton-line lg" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    </div>
  );
}

export function LoadingScreen() {
  const [tip, setTip] = useState(0);
  const tips = [
    'Checking your session…',
    'Connecting securely…',
    'Preparing your workspace…',
  ];
  useEffect(() => {
    const t = setInterval(() => setTip((v) => (v + 1) % tips.length), 1800);
    return () => clearInterval(t);
  }, [tips.length]);

  return (
    <div className="loading-screen">
      <Logo />
      <div className="loading-center">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <Clock size={56} color="#FF1818" />
        </div>
        <h1>Secure exam workspace</h1>
        <p>{tips[tip]}</p>
        <div className="progress-track">
          <div className="progress-value" />
        </div>
      </div>
      <small style={{ color: '#71717A', letterSpacing: '0.04em' }}>
        Protected by Smart Exam Platform
      </small>
    </div>
  );
}

export function FAQ({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq ${open ? 'open' : ''}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{question}</span>
        <ChevronDown size={18} />
      </button>
      {open && <p>{answer}</p>}
    </div>
  );
}

export const featureItems = [
  {
    icon: MonitorCheck,
    title: 'Live monitoring',
    text: 'See attendance, progress, and alerts in one calm control room.',
  },
  {
    icon: LockKeyhole,
    title: 'Auto-lock on violations',
    text: 'Protect exam integrity with clear, immediate safeguards.',
  },
  {
    icon: BookOpen,
    title: 'One question per student',
    text: 'Keep focus high with a distraction-free exam view.',
  },
  {
    icon: FileText,
    title: 'DOCX / Excel import',
    text: 'Move your question bank online without retyping.',
  },
  {
    icon: Clock3,
    title: 'Shared exam clock',
    text: 'Every student sees the same reliable time remaining.',
  },
  {
    icon: ShieldCheck,
    title: 'Single-session protection',
    text: 'Prevent duplicate access and keep every attempt accountable.',
  },
];

export function Icon({ name }) {
  const map = {
    MonitorCheck,
    LockKeyhole,
    BookOpen,
    FileSpreadsheet,
    Clock3,
    ShieldCheck,
  };
  const C = map[name] || ShieldCheck;
  return <C size={21} />;
}
