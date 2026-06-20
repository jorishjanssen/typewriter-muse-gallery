import { RiderSearch } from '@/components/rider/RiderSearch';
import { RiderCard } from '@/components/rider/RiderCard';
import { riders } from '@/data/riders';

/** Landing screen: prominent rider search over a ranked list of riders. */
const Home = () => {
  const ranked = [...riders].sort((a, b) => a.pcsRank - b.pcsRank);

  return (
    <div className="mx-auto min-h-screen max-w-app bg-background">
      <header className="bg-primary px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-primary-foreground">
        <h1 className="text-2xl font-extrabold tracking-tight">ProCycling</h1>
        <p className="text-sm text-primary-foreground/80">
          Cycling stats, built for your phone
        </p>
      </header>

      <div className="space-y-5 px-4 py-4">
        <RiderSearch />

        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            PCS Ranking · Men Elite
          </h2>
          <div className="space-y-2">
            {ranked.map((rider) => (
              <RiderCard key={rider.id} rider={rider} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
