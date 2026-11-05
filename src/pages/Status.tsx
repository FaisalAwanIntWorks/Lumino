import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface SystemStatus {
  component: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  message?: string;
}

export default function Status() {
  const [statuses, setStatuses] = useState<SystemStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  const checkStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('status');
      
      if (error) throw error;
      
      setStatuses(data.statuses || []);
      setLastChecked(new Date());
    } catch (error) {
      console.error('Status check failed:', error);
      setStatuses([
        { component: 'Database', status: 'down', message: 'Unable to connect' },
        { component: 'Authentication', status: 'down', message: 'Unable to connect' },
        { component: 'Edge Functions', status: 'down', message: 'Unable to connect' },
        { component: 'Storage', status: 'down', message: 'Unable to connect' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'down':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'operational':
        return <Badge className="bg-primary">Operational</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-500">Degraded</Badge>;
      case 'down':
        return <Badge variant="destructive">Down</Badge>;
      default:
        return null;
    }
  };

  const overallStatus = statuses.every(s => s.status === 'operational') 
    ? 'operational' 
    : statuses.some(s => s.status === 'down') 
    ? 'down' 
    : 'degraded';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 bg-background py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold mb-4">System Status</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Current operational status of all Aurezo systems
            </p>
            
            <Card className="mb-8">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center gap-4">
                  {getStatusIcon(overallStatus)}
                  <div>
                    <div className="text-2xl font-bold">
                      {overallStatus === 'operational' && 'All Systems Operational'}
                      {overallStatus === 'degraded' && 'Some Systems Degraded'}
                      {overallStatus === 'down' && 'System Issues Detected'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Last checked: {lastChecked.toLocaleTimeString()}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={checkStatus}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {statuses.map((item, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(item.status)}
                      <div>
                        <CardTitle className="text-lg">{item.component}</CardTitle>
                        {item.message && (
                          <CardDescription>{item.message}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {item.latency && (
                        <span className="text-sm text-muted-foreground">
                          {item.latency}ms
                        </span>
                      )}
                      {getStatusBadge(item.status)}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Status updates automatically every 30 seconds</p>
            <p className="mt-2">
              If you're experiencing issues not reflected here, please contact support
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
