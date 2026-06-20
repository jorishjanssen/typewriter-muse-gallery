import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Rider } from '@/data/riders';
import { flagEmoji, formatNumber, getAge, initials } from '@/lib/format';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="text-lg font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-primary-foreground/70">
        {label}
      </div>
    </div>
  );
}

/** Profile hero: identity + headline stats, in the primary (red) brand color. */
export function RiderHeader({ rider }: { rider: Rider }) {
  return (
    <header className="bg-primary px-4 pb-4 pt-3 text-primary-foreground">
      <div className="flex items-center gap-3">
        <Avatar className="h-16 w-16 border-2 border-primary-foreground/30">
          <AvatarFallback className="bg-primary-foreground/15 text-xl font-bold text-primary-foreground">
            {initials(rider.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-extrabold leading-tight">
            <span className="truncate">{rider.name}</span>
            <span aria-hidden className="text-lg">
              {flagEmoji(rider.nationality)}
            </span>
          </h1>
          <p className="mt-0.5 truncate text-sm text-primary-foreground/80">
            {rider.team}
          </p>
          <p className="text-sm text-primary-foreground/70">
            {rider.nationalityName} · {getAge(rider.dateOfBirth)} yrs
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-stretch gap-2 rounded-xl bg-primary-foreground/10 px-2 py-3">
        <Stat label="PCS rank" value={`#${rider.pcsRank}`} />
        <div className="w-px bg-primary-foreground/20" />
        <Stat label="Points" value={formatNumber(rider.pcsPoints)} />
        <div className="w-px bg-primary-foreground/20" />
        <Stat label="Wins" value={String(rider.wins)} />
        <div className="w-px bg-primary-foreground/20" />
        <Stat label="Podiums" value={String(rider.podiums)} />
      </div>
    </header>
  );
}
