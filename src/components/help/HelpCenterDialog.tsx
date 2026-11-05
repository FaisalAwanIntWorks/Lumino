import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MessageCircle, ExternalLink, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface HelpCenterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpCenterDialog({ open, onOpenChange }: HelpCenterDialogProps) {
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Help Center</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex gap-3">
            <Button 
              onClick={() => {
                setChatOpen(true);
                onOpenChange(false);
              }}
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Open AI Assistant
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/help')}
              className="flex-1"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Full Help Page
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/status')}
              className="flex-1"
            >
              <Activity className="h-4 w-4 mr-2" />
              System Status
            </Button>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="getting-started">
              <AccordionTrigger>Getting Started</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Welcome to Aurezo! Here's how to get started:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong>Dashboard:</strong> View analytics, recent orders, and quick actions</li>
                    <li><strong>Catalog:</strong> Browse and configure products for your store</li>
                    <li><strong>Orders:</strong> Track and manage customer orders</li>
                    <li><strong>Design Requests:</strong> Submit custom jewelry requests</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="account-switching">
              <AccordionTrigger>Account Switching</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Click the <strong>Building icon</strong> in the top bar to switch between accounts:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>View all your connected client accounts</li>
                    <li>Quickly switch context without logging out</li>
                    <li>Admins can impersonate clients to troubleshoot issues</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="global-search">
              <AccordionTrigger>Global Search</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Use the search bar at the top to quickly find:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong>Clients:</strong> Search by company name or email</li>
                    <li><strong>Products:</strong> Find products by name or category</li>
                    <li><strong>Orders:</strong> Locate orders by ID or customer email</li>
                  </ul>
                  <p className="mt-3">Press <kbd className="px-2 py-1 bg-muted rounded text-xs">⌘K</kbd> to open global search from anywhere.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="catalog">
              <AccordionTrigger>Managing Your Catalog</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Configure products for your store:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong>Toggle Products:</strong> Enable/disable products for your storefront</li>
                    <li><strong>Set Pricing:</strong> Configure markup or custom retail prices</li>
                    <li><strong>Manufacturing:</strong> Choose self-manufacturing or Aurezo manufacturing</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ai-assistant">
              <AccordionTrigger>AI Chat Assistant</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Use the AI assistant for instant help:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>Ask questions about platform features</li>
                    <li>Get help with product configuration</li>
                    <li>Learn about jewelry terminology</li>
                    <li>Troubleshoot issues</li>
                  </ul>
                  <p className="mt-3">Click the chat icon in the bottom right corner to start a conversation.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="shortcuts">
              <AccordionTrigger>Keyboard Shortcuts</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between items-center py-1">
                    <span>Open Global Search</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">⌘K</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Open Help</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">?</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Close Dialog/Popover</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}
