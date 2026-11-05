import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { useClientCurrency } from '@/hooks/useClientCurrency';
import { formatCurrency } from '@/lib/pricing-utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, BookOpen, MessageSquare, TrendingUp, Zap, Trophy, Star, Lock, Eye, CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClientActivityLogger } from '@/hooks/useClientActivityLogger';
import { constructCdnImageUrl } from '@/lib/cdn-utils';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';

// Interface for popular configuration with image
interface PopularConfig {
  key: string;
  count: number;
  style?: string;
  shank?: string;
  metal?: string;
  shape?: string;
  carat?: number;
  imageUrl?: string | null;
}

// Default FAQ questions for every client
const DEFAULT_FAQ_QUESTIONS = [
  "What are your shop's opening hours?",
  "Do you offer custom jewelry designs?",
  "How do I know my ring size?",
  "Do you provide jewelry repair services?",
  "What is the warranty on your jewelry?",
  "Are your diamonds and gemstones certified?",
  "Can I get my jewelry resized?",
  "What types of payment do you accept?",
  "Do you offer financing or payment plans?",
  "Can I return or exchange my purchase?",
  "Do you offer engraving services?",
  "What is your policy on shipping and delivery?",
  "Are your gemstones ethically sourced?",
  "How do I track my order once it's shipped?",
  "Do you offer gift wrapping for jewelry purchases?",
  
  "Can I buy a gift card for your store?",
  "Do you offer a loyalty or rewards program?"
];


export default function AIConfigurator() {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const { toast } = useToast();
  const activityLogger = useClientActivityLogger();
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const { currency: clientCurrency } = useClientCurrency(clientId);
  const [analytics, setAnalytics] = useState({
    totalChats: 0,
    avgMessages: 0,
    configsApplied: 0,
    designsSaved: 0,
    topConfigs: [] as PopularConfig[],
  });
  const [bestSellers, setBestSellers] = useState({
    topProducts: [] as any[],
    topStyles: [] as any[],
    topMetals: [] as any[],
    topShapes: [] as any[],
    avgOrderValue: 0,
    useForRecommendations: false,
  });
  const [trainingExamples, setTrainingExamples] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [defaultFaqAnswers, setDefaultFaqAnswers] = useState<Record<string, string>>({});
  const [savingFaq, setSavingFaq] = useState<string | null>(null);

  // Check staff permissions for catalog access (which includes AI/Training access)
  const hasCatalogAccess = role !== 'staff' || (staffInfo?.permissions?.catalog_access ?? false);
  const catalogAccessLevel = staffInfo?.permissions?.catalog_access;
  const canEdit = role !== 'staff' || 
    (catalogAccessLevel && String(catalogAccessLevel).toLowerCase() === 'edit');

  useEffect(() => {
    document.title = 'Client • AI Configurator | Aurezo';
    loadData();
  }, [user, role, staffInfo, isImpersonating, impersonatedClientId]);

  // ai_chat_sessions was dropped from the supabase_realtime publication — use polling instead.
  useEffect(() => {
    if (!clientId) return;
    const id = setInterval(() => loadAnalytics(clientId), 45000);
    const onFocus = () => loadAnalytics(clientId);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [clientId]);

  const loadData = async () => {
    // If admin is impersonating a client, use that client's ID directly
    if (isImpersonating && impersonatedClientId) {
      setClientId(impersonatedClientId);
      await Promise.all([
        loadAnalytics(impersonatedClientId),
        loadTrainingExamples(impersonatedClientId),
        loadBestSellers(impersonatedClientId),
      ]);
      setLoading(false);
      return;
    }

    if (!user) return;

    let resolvedClientId: string | null = null;

    // For staff members, use their associated client_id
    if (role === 'staff' && staffInfo?.clientId) {
      resolvedClientId = staffInfo.clientId;
    } else {
      // For clients, find their client record
      const { data: client, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') console.error('Error fetching client:', error);
      if (client) {
        resolvedClientId = client.id;
      }
    }

    if (resolvedClientId && hasCatalogAccess) {
      setClientId(resolvedClientId);
      await Promise.all([
        loadAnalytics(resolvedClientId),
        loadTrainingExamples(resolvedClientId),
        loadBestSellers(resolvedClientId),
      ]);
    }
    setLoading(false);
  };

  const loadAnalytics = async (clientId: string) => {
    // Fetch AI chat sessions
    const { data: sessions } = await supabase
      .from('ai_chat_sessions')
      .select('*')
      .eq('client_id', clientId);

    // Also get saved_designs count
    const { count: savedDesignsCount } = await supabase
      .from('saved_designs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if (sessions) {
      // Total Chats = number of unique conversation sessions with the Aurezo Agent
      const totalChats = sessions.length;
      
      // Total messages across all sessions
      const totalMessages = sessions.reduce((acc, s) => acc + (s.message_count || 0), 0);
      
      // Average messages per session
      const avgMessages = totalChats > 0 
        ? totalMessages / totalChats 
        : 0;
      
      // Configs Applied = sessions where configuration_applied is true
      const configsApplied = sessions.filter(s => s.configuration_applied === true).length;
      
      const designsSaved = savedDesignsCount || 0;

      // Aggregate configurations by key (metal + shape combo)
      const configCounts: Record<string, { count: number; config: Record<string, any> }> = {};
      sessions
        .filter(s => s.configuration_data)
        .forEach(s => {
          const config = s.configuration_data as Record<string, any>;
          // Create a unique key for this configuration
          const key = `${config.style || 'default'}-${config.metal || ''}-${config.shape || ''}`;
          if (configCounts[key]) {
            configCounts[key].count++;
          } else {
            configCounts[key] = { count: 1, config };
          }
        });

      // Sort by count and get top 5
      const sortedConfigs = Object.entries(configCounts)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 5);

      // Extract color family from metal slug (e.g. "14k-yellow-gold" -> "yellow")
      const getColorFamily = (metal: string | undefined): string => {
        if (!metal) return 'yellow';
        const m = metal.toLowerCase();
        if (m.includes('rose') || m.includes('pink')) return 'rose';
        if (m.includes('white') || m.includes('platinum')) return 'white';
        return 'yellow';
      };

      // Fetch matching ring images from my_master_db_data using combination_id
      const topConfigsWithImages: PopularConfig[] = await Promise.all(
        sortedConfigs.map(async ([key, { count, config }]) => {
          const style = config.style as string | undefined;
          const shank = config.shank as string | undefined;
          const shape = config.shape as string | undefined;
          const metal = config.metal as string | undefined;
          
          let imageUrl: string | null = null;
          if (style && shank && shape) {
            const colorFamily = getColorFamily(metal);
            const combinationId = `${style}-${shank}-${colorFamily}-${shape}`;
            
            const { data: matchingRing } = await supabase
              .from('my_master_db_data')
              .select('folder_path, image_0_filename')
              .eq('combination_id', combinationId)
              .limit(1)
              .maybeSingle();
            
            if (matchingRing) {
              imageUrl = constructCdnImageUrl(matchingRing.folder_path, matchingRing.image_0_filename);
            }
          }

          return {
            key,
            count,
            style,
            metal,
            shape,
            shank,
            carat: config.carat as number | undefined,
            imageUrl,
          };
        })
      );

      setAnalytics({
        totalChats,
        avgMessages: Math.round(avgMessages * 10) / 10,
        configsApplied,
        designsSaved,
        topConfigs: topConfigsWithImages,
      });
    }
  };

  const loadTrainingExamples = async (clientId: string) => {
    const { data } = await supabase
      .from('ai_training_examples')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    const examples = data || [];
    setTrainingExamples(examples);
    
    // Populate default FAQ answers from existing training examples
    const faqAnswersMap: Record<string, string> = {};
    DEFAULT_FAQ_QUESTIONS.forEach(question => {
      const existing = examples.find(ex => ex.question === question);
      if (existing) {
        faqAnswersMap[question] = existing.answer;
      } else {
        faqAnswersMap[question] = '';
      }
    });
    setDefaultFaqAnswers(faqAnswersMap);
  };


  const loadBestSellers = async (clientId: string) => {
    // Get completed orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'completed');

    // Get view tracking data
    const { data: viewEvents } = await supabase
      .from('analytics_events')
      .select('*')
      .eq('client_id', clientId)
      .eq('event_type', 'ring_view');

    // Load recommendation toggle from branding_config
    const { data: clientData } = await supabase
      .from('clients')
      .select('branding_config')
      .eq('id', clientId)
      .maybeSingle();
    const useForRecs = (clientData?.branding_config as any)?.ai_recommendations_enabled ?? false;

    if (orders && orders.length > 0) {
      const avgOrderValue = orders.reduce((acc, o) => acc + o.total_amount, 0) / orders.length;
      const configs = orders.map(o => o.configuration);
      
      const styleCounts: Record<string, number> = {};
      const metalCounts: Record<string, number> = {};
      const shapeCounts: Record<string, number> = {};
      
      configs.forEach((config: any) => {
        if (config.style) styleCounts[config.style] = (styleCounts[config.style] || 0) + 1;
        if (config.metal) metalCounts[config.metal] = (metalCounts[config.metal] || 0) + 1;
        if (config.shape) shapeCounts[config.shape] = (shapeCounts[config.shape] || 0) + 1;
      });

      const topStyles = Object.entries(styleCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const topMetals = Object.entries(metalCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const topShapes = Object.entries(shapeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      setBestSellers({
        topProducts: configs.slice(0, 5),
        topStyles,
        topMetals,
        topShapes,
        avgOrderValue: Math.round(avgOrderValue),
        useForRecommendations: useForRecs,
      });
    } else {
      setBestSellers({
        topProducts: [],
        topStyles: [],
        topMetals: [],
        topShapes: [],
        avgOrderValue: 0,
        useForRecommendations: useForRecs,
      });
    }
  };

  const addTrainingExample = async () => {
    if (!clientId || !newQuestion || !newAnswer) return;

    const { error } = await supabase
      .from('ai_training_examples')
      .insert({
        client_id: clientId,
        question: newQuestion,
        answer: newAnswer,
      });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add example', variant: 'destructive' });
    } else {
      toast({ title: 'Added!', description: 'Training example added' });
      await activityLogger.logAiTrainingAdd(newQuestion);
      setNewQuestion('');
      setNewAnswer('');
      loadTrainingExamples(clientId);
    }
  };

  const deleteTrainingExample = async (id: string, question?: string) => {
    const { error } = await supabase
      .from('ai_training_examples')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete example', variant: 'destructive' });
    } else {
      toast({ title: 'Deleted!', description: 'Training example removed' });
      await activityLogger.logAiTrainingDelete(id, question);
      if (clientId) loadTrainingExamples(clientId);
    }
  };

  const saveFaqAnswer = async (question: string, answer: string) => {
    if (!clientId || !answer.trim()) return;
    
    setSavingFaq(question);
    
    // Check if this FAQ already exists
    const existingExample = trainingExamples.find(ex => ex.question === question);
    
    if (existingExample) {
      // Update existing
      const { error } = await supabase
        .from('ai_training_examples')
        .update({ answer: answer.trim() })
        .eq('id', existingExample.id);
        
      if (error) {
        toast({ title: 'Error', description: 'Failed to save answer', variant: 'destructive' });
      } else {
        toast({ title: 'Saved!', description: 'FAQ answer updated' });
        await activityLogger.logAiTrainingUpdate(question);
        loadTrainingExamples(clientId);
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('ai_training_examples')
        .insert({
          client_id: clientId,
          question: question,
          answer: answer.trim(),
        });
        
      if (error) {
        toast({ title: 'Error', description: 'Failed to save answer', variant: 'destructive' });
      } else {
        toast({ title: 'Saved!', description: 'FAQ answer added' });
        await activityLogger.logAiTrainingAdd(question);
        loadTrainingExamples(clientId);
      }
    }
    
    setSavingFaq(null);
  };

  // Get custom training examples (not default FAQs)
  const customTrainingExamples = trainingExamples.filter(
    ex => !DEFAULT_FAQ_QUESTIONS.includes(ex.question)
  );

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 sm:h-10 w-48 sm:w-64 mb-4 sm:mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 sm:h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Show access denied for staff without catalog/AI access
  if (role === 'staff' && !hasCatalogAccess) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">AI Configurator</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Configure and analyze your AI assistant</p>
        </div>
        <Alert variant="destructive" className="max-w-2xl">
          <Lock className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription className="text-sm">
            You do not have permission to view the Aurezo Agent Training or Catalog. 
            Please contact your account administrator to request access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">AI Configurator</h1>
          {role === 'staff' && !canEdit && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Eye className="w-3 h-3" />
              View Only
            </Badge>
          )}
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Configure and analyze your AI assistant</p>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4 sm:space-y-6">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto pb-px">
          <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="analytics" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="best-sellers" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Best Sellers</span>
              <span className="sm:hidden">Best</span>
            </TabsTrigger>
            <TabsTrigger value="training" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline sm:inline">Training</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analytics" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <div className="text-xs sm:text-sm text-muted-foreground">Total Chats</div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{analytics.totalChats}</div>
            </Card>

            <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/15 to-primary/5 border-primary/20">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <div className="text-xs sm:text-sm text-muted-foreground">Avg Messages</div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{analytics.avgMessages}</div>
            </Card>

            <Card className="p-4 sm:p-6 bg-gradient-to-br from-green-500/15 to-green-500/5 border-green-500/20">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                <div className="text-xs sm:text-sm text-muted-foreground">Configs Applied</div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{analytics.configsApplied}</div>
              <div className="text-xs text-green-600 mt-1">
                {analytics.totalChats > 0
                  ? `${Math.round((analytics.configsApplied / analytics.totalChats) * 100)}% conversion`
                  : '0% conversion'}
              </div>
            </Card>

            <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <div className="text-xs sm:text-sm text-muted-foreground">Designs Saved</div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{analytics.designsSaved}</div>
            </Card>
          </div>

          <Card className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-foreground">Popular Configurations</h3>
            {analytics.topConfigs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {analytics.topConfigs.map((config, idx) => (
                  <div key={config.key} className="bg-muted rounded-lg overflow-hidden border border-border">
                    {/* Ring Image */}
                    <div className="aspect-square bg-background relative">
                      {config.imageUrl ? (
                        <img 
                          src={config.imageUrl} 
                          alt={`${config.shape || 'Ring'} configuration`}
                          className="w-full h-full object-contain p-2"
                          onError={(e) => {
                            // Retry the .png twin of a failed .webp before the placeholder.
                            if (fallbackToPngOnError(e)) return;
                            (e.target as HTMLImageElement).src = '/placeholder.svg';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <span className="text-xs">No image</span>
                        </div>
                      )}
                      {/* Rank Badge */}
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                        #{idx + 1}
                      </div>
                      {/* Count Badge */}
                      <div className="absolute top-2 right-2 bg-background/90 text-foreground text-xs px-2 py-0.5 rounded-full border border-border">
                        {config.count} {config.count === 1 ? 'time' : 'times'}
                      </div>
                    </div>
                    {/* Configuration Details */}
                    <div className="p-3 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {config.style && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{config.style}</span>
                        )}
                        {config.metal && (
                          <span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded">{config.metal}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {config.shape && (
                          <span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded">{config.shape}</span>
                        )}
                        {config.carat && (
                          <span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded">{config.carat} ct</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No configuration data available yet.</p>
            )}
          </Card>
        </TabsContent>


        <TabsContent value="best-sellers" className="space-y-4 sm:space-y-6">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">Smart Recommendations</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">Analyze best-selling products to improve AI recommendations</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="use-recommendations" className="text-xs sm:text-sm whitespace-nowrap">Enable for AI</Label>
                <Switch
                  id="use-recommendations"
                  checked={bestSellers.useForRecommendations}
                  onCheckedChange={async (checked) => {
                    setBestSellers({ ...bestSellers, useForRecommendations: checked });
                    if (clientId) {
                      const { data: current } = await supabase.from('clients').select('branding_config').eq('id', clientId).maybeSingle();
                      const config = (current?.branding_config as Record<string, any>) || {};
                      await supabase.from('clients').update({ branding_config: { ...config, ai_recommendations_enabled: checked } }).eq('id', clientId);
                      toast({ title: checked ? 'Enabled' : 'Disabled', description: `AI recommendations ${checked ? 'enabled' : 'disabled'}` });
                    }
                  }}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
              <Card className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Avg Order Value</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(bestSellers.avgOrderValue, clientCurrency)}</div>
              </Card>

              <Card className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Top Styles</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-foreground">{bestSellers.topStyles.length}</div>
              </Card>

              <Card className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Top Metals</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-foreground">{bestSellers.topMetals.length}</div>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <h4 className="text-sm font-semibold mb-2 sm:mb-3 text-foreground">Most Popular Styles</h4>
                <div className="space-y-2">
                  {bestSellers.topStyles.map((style, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 sm:p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Badge variant="secondary" className="text-xs">{idx + 1}</Badge>
                        <span className="font-medium text-sm text-foreground capitalize">{style.name}</span>
                      </div>
                      <span className="text-xs sm:text-sm text-muted-foreground">{style.count} orders</span>
                    </div>
                  ))}
                  {bestSellers.topStyles.length === 0 && (
                    <p className="text-xs sm:text-sm text-muted-foreground text-center py-6 sm:py-8">No data yet. Complete orders will appear here.</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 sm:mb-3 text-foreground">Most Popular Metals</h4>
                <div className="space-y-2">
                  {bestSellers.topMetals.map((metal, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 sm:p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Badge variant="secondary" className="text-xs">{idx + 1}</Badge>
                        <span className="font-medium text-sm text-foreground capitalize">{metal.name}</span>
                      </div>
                      <span className="text-xs sm:text-sm text-muted-foreground">{metal.count} orders</span>
                    </div>
                  ))}
                  {bestSellers.topMetals.length === 0 && (
                    <p className="text-xs sm:text-sm text-muted-foreground text-center py-6 sm:py-8">No data yet. Complete orders will appear here.</p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="space-y-4 sm:space-y-6">
          {!canEdit && (
            <Alert className="bg-muted">
              <Eye className="h-4 w-4" />
              <AlertDescription className="text-sm">
                You have view-only access. Contact your administrator to modify the training data.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Accordion 1: Default FAQs */}
          <Collapsible defaultOpen>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-muted/30 transition-colors text-left group">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-foreground">Default FAQ Questions</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {DEFAULT_FAQ_QUESTIONS.filter(q => trainingExamples.some(ex => ex.question === q)).length}/{DEFAULT_FAQ_QUESTIONS.length} answered
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-border pt-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                    {canEdit 
                      ? "Fill in answers to these frequently asked questions. The Aurezo Agent will use these to provide accurate responses to your customers."
                      : "View the FAQ questions and answers configured for your store."
                    }
                  </p>
                  <div className="space-y-2">
                    {DEFAULT_FAQ_QUESTIONS.map((question, idx) => {
                      const isAnswered = trainingExamples.some(ex => ex.question === question);
                      return (
                        <Collapsible key={question}>
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-center gap-3 p-3 sm:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left group">
                              <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                              {isAnswered ? (
                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                              ) : (
                                <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                              )}
                              <span className="flex-1 font-medium text-xs sm:text-sm text-foreground">{question}</span>
                              {isAnswered && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 hidden sm:inline-flex">Answered</Badge>
                              )}
                              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 ml-8 sm:ml-12 space-y-2">
                              <Textarea
                                value={defaultFaqAnswers[question] || ''}
                                onChange={(e) => setDefaultFaqAnswers(prev => ({
                                  ...prev,
                                  [question]: e.target.value
                                }))}
                                placeholder={canEdit ? "Type your answer here..." : "No answer provided yet"}
                                className="min-h-[80px] sm:min-h-[100px] text-xs sm:text-sm bg-background"
                                disabled={!canEdit}
                              />
                              {canEdit && (
                                <Button
                                  size="sm"
                                  className="text-xs sm:text-sm"
                                  onClick={() => saveFaqAnswer(question, defaultFaqAnswers[question] || '')}
                                  disabled={!defaultFaqAnswers[question]?.trim() || savingFaq === question}
                                >
                                  {savingFaq === question ? 'Saving...' : (isAnswered ? 'Update Answer' : 'Save Answer')}
                                </Button>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Accordion 2: Custom Questions */}
          <Collapsible defaultOpen>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-muted/30 transition-colors text-left group">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4 text-accent-foreground" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-foreground">Custom Questions</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {customTrainingExamples.length} custom {customTrainingExamples.length === 1 ? 'example' : 'examples'} added
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-border pt-4 space-y-5">
                  {/* Add new custom question form */}
                  {canEdit && (
                    <div className="space-y-3 sm:space-y-4 p-4 rounded-lg border border-dashed border-border bg-muted/30">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Add your own custom questions and answers beyond the default FAQs.
                      </p>
                      <div>
                        <Label className="text-sm">Question</Label>
                        <Input
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          placeholder="What metals do you offer?"
                          className="mt-2 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Answer</Label>
                        <Textarea
                          value={newAnswer}
                          onChange={(e) => setNewAnswer(e.target.value)}
                          placeholder="We offer 14K and 18K gold in yellow, rose, and white, plus platinum..."
                          className="mt-2 text-sm min-h-[80px] sm:min-h-[100px]"
                        />
                      </div>
                      <Button onClick={addTrainingExample} disabled={!newQuestion || !newAnswer} size="default">
                        Add Example
                      </Button>
                    </div>
                  )}

                  {/* Existing custom examples list */}
                  {customTrainingExamples.length > 0 ? (
                    <div className="space-y-2 sm:space-y-3">
                      {customTrainingExamples.map((example) => (
                        <div key={example.id} className="p-3 sm:p-4 bg-muted rounded-lg">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-xs sm:text-sm text-foreground mb-1 break-words">Q: {example.question}</p>
                              <p className="text-xs sm:text-sm text-muted-foreground break-words">A: {example.answer}</p>
                            </div>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteTrainingExample(example.id, example.question)}
                                className="text-destructive hover:text-destructive self-end sm:self-start shrink-0"
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !canEdit && (
                      <p className="text-muted-foreground text-xs sm:text-sm">
                        No custom training examples have been added yet.
                      </p>
                    )
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>
      </Tabs>
    </div>
  );
}