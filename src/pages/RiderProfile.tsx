import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RiderHeader } from '@/components/rider/RiderHeader';
import { SpecialtyBars } from '@/components/rider/SpecialtyBars';
import { Palmares } from '@/components/rider/Palmares';
import { SeasonResults } from '@/components/rider/SeasonResults';
import { getRider } from '@/data/riders';

const RiderProfile = () => {
  const { riderId } = useParams<{ riderId: string }>();
  const rider = riderId ? getRider(riderId) : undefined;

  return (
    <div className="mx-auto min-h-screen max-w-app bg-background">
      {/* Sticky back bar keeps navigation reachable while scrolling. */}
      <div className="sticky top-0 z-20 flex items-center gap-2 bg-primary px-2 py-2 text-primary-foreground">
        <Link
          to="/"
          aria-label="Back to riders"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-primary-foreground/15"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="truncate font-semibold">
          {rider ? rider.name : 'Rider'}
        </span>
      </div>

      {!rider ? (
        <div className="px-4 py-16 text-center">
          <p className="text-lg font-semibold">Rider not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn't find a rider for “{riderId}”.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            Back to riders
          </Link>
        </div>
      ) : (
        <>
          <RiderHeader rider={rider} />

          <div className="space-y-5 px-4 py-4">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Specialties
              </h2>
              <SpecialtyBars rider={rider} />
            </section>

            <Tabs defaultValue="results">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="palmares">Palmarès</TabsTrigger>
              </TabsList>
              <TabsContent value="results" className="mt-3">
                <SeasonResults rider={rider} />
              </TabsContent>
              <TabsContent value="palmares" className="mt-3">
                <Palmares rider={rider} />
              </TabsContent>
            </Tabs>

            <p className="pb-6 pt-2 text-center text-xs text-muted-foreground">
              {rider.raceDays} career race days · demo data
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default RiderProfile;
