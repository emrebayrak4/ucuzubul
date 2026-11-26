/** Soft sky-blue band that holds the white travel search panel at the top of every travel page. */
export function TravelBand({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-travel-soft py-6 lg:py-8" data-testid="travel-band">
      <div className="container-content">
        <h1 className="text-2xl font-bold tracking-tight text-travel-soft-fg lg:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-text">{sub}</p> : null}
        <div className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">{children}</div>
      </div>
    </section>
  );
}
