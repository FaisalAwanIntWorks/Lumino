import { supabase } from '@/integrations/supabase/client';

export const trackRingView = async (clientId: string, ringConfig: any) => {
  try {
    await supabase.from('analytics_events').insert({
      client_id: clientId,
      event_type: 'ring_view',
      metadata: {
        style: ringConfig.style,
        metal: ringConfig.metal,
        shape: ringConfig.shape,
        shank: ringConfig.shank,
        carat: ringConfig.caratRange,
        stone: ringConfig.stone,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to track ring view:', error);
  }
};
