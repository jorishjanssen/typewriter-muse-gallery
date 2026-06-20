import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Rider } from '@/data/riders';
import { flagEmoji, formatNumber, initials } from '@/lib/format';

/** Compact, tappable rider row for lists. Whole card is the tap target. */
export function RiderCard({ rider }: { rider: Rider }) {
  return (
    <Link
      to={`/rider/${rider.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors active:bg-muted"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold tabular-nums text-secondary-foreground">
        {rider.pcsRank}
      </div>
      <Avatar className="h-11 w-11">
        <AvatarFallback className="bg-primary/10 font-semibold text-primary">
          {initials(rider.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="truncate">{rider.name}</span>
          <span aria-hidden>{flagEmoji(rider.nationality)}</span>
        </div>
        <div className="truncate text-sm text-muted-foreground">{rider.team}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold tabular-nums">{formatNumber(rider.pcsPoints)}</div>
        <div className="text-xs text-muted-foreground">pts</div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
