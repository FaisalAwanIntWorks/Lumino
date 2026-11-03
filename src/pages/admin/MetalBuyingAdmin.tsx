import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Coins } from 'lucide-react';

export default function MetalBuyingAdmin() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />
          Metal IQ
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of the Metal IQ feature for all clients
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Metal IQ lets jewelers buy gold, silver, and platinum from customers with live pricing.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Customers fill out a form selecting metal type, karat, and weight</li>
              <li>Live spot prices from GoldAPI calculate an instant estimate</li>
              <li>Jewelers configure their buy-at percentages per metal/karat</li>
              <li>Competitor comparison shows customers they're getting a better deal</li>
              <li>Leads are scored (Hot, Warm, Cold, Suspect) based on data quality and profit</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Testing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>To test Metal IQ:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Enable the <strong>metal_buying</strong> feature flag for a client</li>
              <li>Use "Login As" to impersonate that client</li>
              <li>Navigate to Metal IQ → Config to set up buy rates</li>
              <li>Navigate to Metal IQ → Leads to view submissions</li>
              <li>Test the embed form at <code>/embed-metal-buying/:clientId</code></li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
