import { Link } from 'react-router-dom';

export default function TopBar({
  unread,
  right,
}: {
  unread?: number;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 bg-paper/90 dark:bg-night/90 backdrop-blur border-b border-ink/10 dark:border-snow/10">
      <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-serif text-xl font-bold tracking-tight">Échappée</span>
          {unread !== undefined && unread > 0 && (
            <span className="text-xs font-medium rounded-full bg-accent text-white px-2 py-0.5">
              {unread}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-1">{right}</div>
      </div>
    </header>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  to,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  to?: string;
}) {
  const cls =
    'p-2 rounded-full hover:bg-ink/5 dark:hover:bg-snow/10 text-ink/70 dark:text-snow/70 transition-colors';
  if (to)
    return (
      <Link to={to} aria-label={label} title={label} className={cls}>
        {children}
      </Link>
    );
  return (
    <button aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
