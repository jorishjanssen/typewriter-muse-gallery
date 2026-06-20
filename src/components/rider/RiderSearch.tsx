import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { riders } from '@/data/riders';
import { flagEmoji, initials } from '@/lib/format';

/**
 * Rider search built on cmdk. Filters the mock rider list as you type and
 * navigates to the selected rider's profile. Search is the primary way to
 * find a rider on mobile.
 */
export function RiderSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  return (
    <Command
      // cmdk filters by the `value` of each item; we match name + team + country.
      className="rounded-xl border shadow-sm"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search riders…"
        className="text-base"
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
          No riders found.
        </CommandEmpty>
        <CommandGroup heading="Riders">
          {riders.map((rider) => (
            <CommandItem
              key={rider.id}
              value={`${rider.name} ${rider.team} ${rider.nationalityName}`}
              onSelect={() => navigate(`/rider/${rider.id}`)}
              className="flex items-center gap-3 py-3"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-secondary text-xs font-semibold">
                  {initials(rider.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{rider.name}</span>
                  <span aria-hidden>{flagEmoji(rider.nationality)}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {rider.team}
                </div>
              </div>
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
