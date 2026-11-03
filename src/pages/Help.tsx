import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MessageCircle, Search, Package, ShoppingCart, Sparkles, Settings, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Help() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 bg-background py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold mb-4">Help Center</h1>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about using the JewlX platform
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <Button onClick={() => navigate('/status')} variant="outline">
                <Activity className="h-4 w-4 mr-2" />
                System Status
              </Button>
            </div>
          </div>

          <div className="grid gap-6 mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Global Search
                </CardTitle>
                <CardDescription>Find anything quickly across the platform</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The global search bar at the top of every page lets you instantly find clients, products, and orders. 
                  Just start typing and results will appear in real-time.
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                  <li><strong>Clients:</strong> Search by company name or email address</li>
                  <li><strong>Products:</strong> Find products by name, category, or description</li>
                  <li><strong>Orders:</strong> Locate orders by ID or customer information</li>
                </ul>
                <p className="text-sm font-medium mt-4">
                  Keyboard shortcut: <kbd className="px-2 py-1 bg-muted rounded text-xs ml-2">⌘K</kbd>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Product Catalog
                </CardTitle>
                <CardDescription>Configure and manage your product offerings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The catalog page lets you customize which products appear in your store and how they're priced.
                </p>
                <Accordion type="single" collapsible>
                  <AccordionItem value="enabling">
                    <AccordionTrigger className="text-sm">Enabling Products</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      Toggle the switch next to any product to enable or disable it for your storefront. 
                      Disabled products won't be visible to your customers.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="pricing">
                    <AccordionTrigger className="text-sm">Setting Prices</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      Click "Configure" to set custom pricing. You can either use a markup percentage 
                      (e.g., 100% = 2x base cost) or set a fixed retail price.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="manufacturing">
                    <AccordionTrigger className="text-sm">Manufacturing Options</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      Choose whether you'll manufacture products yourself or use JewlX manufacturing services. 
                      You can enable both options and let customers choose.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <p className="text-xs text-muted-foreground italic mt-4">
                  Note: All products in our catalog are licensed exclusively to JewlX
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Order Management
                </CardTitle>
                <CardDescription>Track and fulfill customer orders</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  View all orders, update statuses, and manage shipping from the Orders page.
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Filter orders by status (pending, processing, completed)</li>
                  <li>Update manufacturing and shipping information</li>
                  <li>Download CAD files for custom designs</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Chat Assistant
                </CardTitle>
                <CardDescription>Get instant help with platform questions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The AI assistant is available 24/7 to answer questions about:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Platform features and navigation</li>
                  <li>Product configuration and pricing</li>
                  <li>Jewelry terminology and specifications</li>
                  <li>Order processing and fulfillment</li>
                  <li>Account settings and preferences</li>
                </ul>
                <p className="text-sm font-medium mt-4">
                  Access the chat widget from the bottom right corner of any page.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Account Settings
                </CardTitle>
                <CardDescription>Customize your account and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Access account settings from the Settings page in your dashboard:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Update company information and branding</li>
                  <li>Configure integrations (Shopify, CRM)</li>
                  <li>Manage team members and sub-accounts</li>
                  <li>Set notification preferences</li>
                  <li>View billing and subscription details</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Still need help? Our AI assistant is here for you.
            </p>
            <Button size="lg">
              <MessageCircle className="h-4 w-4 mr-2" />
              Chat with AI Assistant
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
