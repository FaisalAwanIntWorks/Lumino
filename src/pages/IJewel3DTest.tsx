import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function IJewel3DTest() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">iJewel3D 3D Viewer Test</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        <div className="flex flex-col items-center gap-6">
          {/* Iframe Container */}
          <div className="w-full max-w-5xl aspect-video bg-muted rounded-lg overflow-hidden shadow-lg">
            <iframe
              title="iJewel3D 3D Ring Viewer"
              src="https://ijewel3d.com/drive/files/M9DU4SW4Q32b-dN5sq-6cQ/embedded?slug=M9DU4SW4Q32b-dN5sq-6cQ"
              width="100%"
              height="100%"
              frameBorder="0"
              allow="camera; autoplay; fullscreen; xr-spatial-tracking; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          </div>

          {/* Description */}
          <p className="text-muted-foreground text-center max-w-2xl">
            Interactive 3D ring viewer embedded from iJewel3D. Use mouse or touch to rotate, zoom, and explore the model.
          </p>
        </div>
      </main>
    </div>
  );
}
