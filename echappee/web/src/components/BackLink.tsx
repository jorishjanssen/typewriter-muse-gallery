import { Link, useLocation, useNavigate } from 'react-router-dom';

/**
 * Go back in history, or home when this is the first entry (deep link /
 * fresh PWA launch on a subpage) so "back" never exits the app.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key === 'default' ? navigate('/') : navigate(-1));
}

/** Compact inline back affordance for drill-down pages, now that the header is gone. */
export default function BackLink({ label, to }: { label: string; to?: string }) {
  const goBack = useGoBack();
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
    <button onClick={goBack} className={cls}>
      {arrow}
      {label}
    </button>
  );
}
