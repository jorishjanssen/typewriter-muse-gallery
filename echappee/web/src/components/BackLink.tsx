import { Link, useNavigate } from 'react-router-dom';

/** Compact inline back affordance for drill-down pages, now that the header is gone. */
export default function BackLink({ label, to }: { label: string; to?: string }) {
  const navigate = useNavigate();
  const cls =
    'inline-flex items-center gap-1 -ml-1 px-1 py-2 text-sm font-medium opacity-60 hover:opacity-100 hover:text-accent transition-colors';
  const arrow = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M19 12H5m7-7-7 7 7 7" />
    </svg>
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {arrow}
        {label}
      </Link>
    );
  return (
    <button onClick={() => navigate(-1)} className={cls}>
      {arrow}
      {label}
    </button>
  );
}
