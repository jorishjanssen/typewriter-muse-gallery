import { Trophy } from 'lucide-react';
import type { Rider } from '@/data/riders';

/** Career highlights as a vertical list; wins get a trophy + accent styling. */
export function Palmares({ rider }: { rider: Rider }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rider.topPalmares.map((entry, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
              entry.isWin
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {entry.isWin ? <Trophy className="h-4 w-4" /> : entry.result}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{entry.race}</div>
            <div className="text-xs text-muted-foreground">
              {entry.year}
              {entry.isWin ? ` · ${entry.result}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
