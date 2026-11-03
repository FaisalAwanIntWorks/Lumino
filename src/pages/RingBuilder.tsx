import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const RingBuilder = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20">
        <section className="py-12 px-6">
          <div className="container mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 text-center">
              <span className="gradient-text">Design Your Dream Ring</span>
            </h1>
            <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto text-lg">
              Create a custom piece as unique as you. Explore our collection and bring your vision to life.
            </p>
            <div className="w-full rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg bg-white">
              <iframe 
                src="https://app.pencildesign.co/partner/45f98017/all-galleries"
                width="100%"
                height="600"
                frameBorder="0"
                title="AI Builder"
              />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default RingBuilder;
