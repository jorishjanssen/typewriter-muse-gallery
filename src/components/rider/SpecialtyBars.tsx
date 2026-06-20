import type { Rider } from '@/data/riders';
import { SPECIALTY_LABELS, type SpecialtyScores } from '@/data/riders';

const ORDER: (keyof SpecialtyScores)[] = [
  'oneDay',
  'gc',
  'timeTrial',
  'sprint',
  'climber',
  'hills',
];

/**
 * Mobile-friendly replacement for PCS's specialty points table: a vertical
 * stack of labeled horizontal bars, sorted strongest-first.
 */
export function SpecialtyBars({ rider }: { rider: Rider }) {
  const sorted = [...ORDER].sort(
    (a, b) => rider.specialties[b] - rider.specialties[a],
  );

  return (
    <div className="space-y-3">
      {sorted.map((key) => {
        const value = rider.specialties[key];
        return (
          <div key={key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{SPECIALTY_LABELS[key]}</span>
              <span className="tabular-nums text-muted-foreground">{value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${value}%` }}
                role="meter"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={SPECIALTY_LABELS[key]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
