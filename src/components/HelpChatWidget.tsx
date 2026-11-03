import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, Link } from 'react-router-dom';
import { FacetShiftThinking } from '@/components/ui/FacetShiftThinking';
import { useAuth } from '@/contexts/AuthContext';

interface Source {
  filename?: string | null;
  snippet: string;
  similarity?: number | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  usedRag?: boolean;
  sources?: Source[];
  insufficientCredits?: boolean;
}

export function HelpChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m your JewelX assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Lock body scroll on mobile when chat is open
  useEffect(() => {
    if (isOpen && window.innerWidth < 640) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = original; };
    }
  }, [isOpen]);

  // Load client ID for RAG
  useEffect(() => {
    const loadClientId = async () => {
      if (!user) return;
      
      const { data: client, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      // Not all authenticated users have a client row (e.g. agency admins)
      if (error && error.code !== 'PGRST116') {
        console.error('Error loading client ID:', error);
        return;
      }
      
      if (client) {
        setClientId(client.id);
      }
    };
    
    loadClientId();
  }, [user]);

  const quickActions = [
    'How do I add products?',
    'Managing client access',
    'Understanding manufacturing',
    'Commission tracking'
  ];

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;

    const userMessage: Message = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const doInvoke = () => supabase.functions.invoke('jewelx-help', {
        body: {
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          context: location.pathname,
          clientId: clientId,
        }
      });

      let result = await doInvoke();

      // Auto-retry once on 503 (AI timeout)
      if (result.error && (result.error as any)?.status === 503) {
        console.log('[HelpChat] Got 503, retrying in 2s...');
        await new Promise(r => setTimeout(r, 2000));
        result = await doInvoke();
      }

      if (result.error) {
        const status = (result.error as any)?.status;
        if (status === 429) {
          throw new Error('AI is busy right now. Please wait a moment and try again.');
        } else if (status === 402) {
          throw new Error('__INSUFFICIENT_CREDITS__');
        } else if (status === 503) {
          throw new Error('AI is momentarily unavailable. Please try again in a few seconds.');
        }
        throw result.error;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.data.response,
        usedRag: result.data.usedRag,
        sources: result.data.sources,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const rawMsg = error instanceof Error ? error.message : '';
      if (rawMsg === '__INSUFFICIENT_CREDITS__') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Credits Insufficient, please recharge now.',
          insufficientCredits: true,
        }]);
      } else {
        const errorMessage = rawMsg || 'Sorry, I encountered an error. Please try again.';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: errorMessage,
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <Card data-chat-card className="fixed inset-x-2 bottom-16 sm:inset-auto sm:bottom-20 sm:right-6 sm:w-96 h-[calc(100vh-5rem)] sm:h-[500px] max-h-[600px] shadow-2xl shadow-luxury z-50 flex flex-col border-2 border-primary/20 glass-card animate-scale-in" style={{ overscrollBehavior: 'none' }}>
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-5 border-b-2 border-primary/20 gradient-emerald text-white rounded-t-xl">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
              <h3 className="font-semibold text-sm sm:text-base">JewelX Assistant</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="hover:bg-white/20 text-white h-8 w-8 sm:h-10 sm:w-10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 p-3 sm:p-4">
            <div className="space-y-3 sm:space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-2.5 sm:p-3 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="text-xs sm:text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.insufficientCredits && (
                      <div className="mt-3">
                        <Button asChild size="sm" className="h-8 text-xs gap-1.5" onClick={() => setIsOpen(false)}>
                          <Link to="/client/usage">
                            <Wallet className="h-3.5 w-3.5" />
                            Buy Credits
                          </Link>
                        </Button>
                      </div>
                    )}
                    {msg.usedRag && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <Sparkles className="h-3 w-3" />
                          <span>Searched your PDFs</span>
                        </div>
                        {msg.sources && msg.sources.length > 0 && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none">Sources</summary>
                            <ul className="mt-2 space-y-2">
                              {msg.sources.map((s, idx) => (
                                <li
                                  key={idx}
                                  className="rounded-md border border-border/60 bg-background/40 p-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground/80 text-xs truncate">
                                      {s.filename ?? 'Document'}
                                    </span>
                                    {typeof s.similarity === 'number' && (
                                      <span className="text-muted-foreground text-xs">
                                        {Math.round(s.similarity * 100)}%
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap text-xs">{s.snippet}</p>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-2.5 sm:p-3">
                    <FacetShiftThinking />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick Actions */}
          {messages.length === 1 && (
            <div className="px-3 sm:px-4 pb-2">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {quickActions.map((action, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(action)}
                    className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3"
                  >
                    {action}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 sm:p-4 border-t border-border">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything..."
                disabled={loading}
                inputMode="text"
                onFocus={() => setTimeout(() => window.scrollTo(0, 0), 100)}
                className="flex-1 h-9 sm:h-10 text-sm"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-9 w-9 sm:h-10 sm:w-10">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg z-50"
      >
        {isOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <MessageCircle className="h-6 w-6 sm:h-7 sm:w-7 text-white" />}
      </Button>
    </>
  );
}
