export interface SheetAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

/** Bottom action sheet for contextual actions (long-press on a card). */
export default function ActionSheet({
  open,
  title,
  actions,
  onClose,
}: {
  open: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl rounded-t-2xl bg-paper dark:bg-night p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        {title && (
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide opacity-50 truncate">
            {title}
          </p>
        )}
        <ul>
          {actions.map((a) => (
            <li key={a.label}>
              <button
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
                className={`w-full rounded-xl px-3 py-3 text-left text-[0.95rem] font-medium hover:bg-ink/5 dark:hover:bg-snow/10 ${
                  a.destructive ? 'text-accent' : ''
                }`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="mt-1 w-full rounded-xl border border-ink/15 dark:border-snow/20 px-3 py-3 text-[0.95rem] font-medium opacity-70"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
