import { HeroSection } from "@/components/HeroSection";
import { SignatureDishesSection } from "@/components/SignatureDishesSection";
import { ZoneAmbianceSection } from "@/components/ZoneAmbianceSection";
import { CulinaryPhilosophySection } from "@/components/CulinaryPhilosophySection";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-obsidian">
      <HeroSection />
      <SignatureDishesSection />
      <ZoneAmbianceSection />
      <CulinaryPhilosophySection />
    </div>
  );
}
