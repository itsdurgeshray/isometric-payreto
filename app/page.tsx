import IsometricTriad from "@/components/payreto/IsometricTriad";

export default function Page() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 md:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0230AE]">Our Model</p>
        <h2 className="mt-4 text-center font-serif text-4xl tracking-[-0.025em] text-[#03060f] md:text-5xl">
          Three Stages, One Operating Partner
        </h2>
        <p className="mt-4 max-w-xl text-center text-[15px] text-[#4f4f4f]">
          Demo section for the isometric triad component.
        </p>
        <div className="mt-12 w-full max-w-[760px] md:mt-16">
          <IsometricTriad />
        </div>
      </section>
    </main>
  );
}
