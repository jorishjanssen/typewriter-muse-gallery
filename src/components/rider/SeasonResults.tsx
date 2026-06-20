import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { Rider } from '@/data/riders';
import { formatShortDate } from '@/lib/format';

/**
 * The core dense-table -> mobile transform. PCS shows season results as a wide
 * table; here each season is a collapsible row, and each result is a vertical
 * list item (date · race · result · points) — no horizontal scrolling.
 */
export function SeasonResults({ rider }: { rider: Rider }) {
  const [latest] = rider.seasons;

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={latest ? `season-${latest.year}` : undefined}
      className="space-y-2"
    >
      {rider.seasons.map((season) => (
        <AccordionItem
          key={season.year}
          value={`season-${season.year}`}
          className="overflow-hidden rounded-xl border bg-card"
        >
          <AccordionTrigger className="px-3 py-3 hover:no-underline">
            <div className="flex flex-1 items-center justify-between pr-2 text-left">
              <div>
                <div className="text-base font-bold tabular-nums">{season.year}</div>
                <div className="text-xs text-muted-foreground">{season.team}</div>
              </div>
              <div className="flex items-center gap-3 text-right text-xs">
                <div>
                  <div className="font-semibold tabular-nums text-foreground">
                    {season.wins}
                  </div>
                  <div className="text-muted-foreground">wins</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums text-foreground">
                    {season.pcsPoints}
                  </div>
                  <div className="text-muted-foreground">pts</div>
                </div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-0 pb-0">
            <ul className="divide-y border-t">
              {season.results.map((result, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatShortDate(result.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {result.race}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      result.result === '1st' ? 'text-primary' : ''
                    }`}
                  >
                    {result.result}
                  </span>
                  {result.pcsPoints != null && (
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {result.pcsPoints}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
