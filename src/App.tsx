// App entry point
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazy-retry";
import '@/styles/screenshot-protection.css';

// Lazy load heavy 3D pages to prevent build timeout
const EmbedConfigurator = lazyRetry(() => import("./pages/EmbedConfigurator"));
const EmbedDiamondsForm = lazyRetry(() => import("./pages/EmbedDiamondsForm"));
const EmbedGrillzForm = lazyRetry(() => import("./pages/EmbedGrillzForm"));
const EmbedCustomEnquiry = lazyRetry(() => import("./pages/EmbedCustomEnquiry"));
const EmbedMetalBuying = lazyRetry(() => import("./pages/EmbedMetalBuying"));
const RingBuilder = lazyRetry(() => import("./pages/RingBuilder"));
const CustomRingBuilder = lazyRetry(() => import("./pages/CustomRingBuilder"));
const Ring3DDemo = lazyRetry(() => import("./pages/Ring3DDemo"));
const IJewel3DTest = lazyRetry(() => import("./pages/IJewel3DTest"));
const ProductDetail = lazyRetry(() => import("./pages/ProductDetail"));

import { AuthProvider } from "./contexts/AuthContext";
import { FeatureGuard } from "./components/layout/FeatureGuard";
import { CUSTOM_X_FEATURE_KEYS } from "@/lib/feature-registry";
import { AdminImpersonationProvider } from "./contexts/AdminImpersonationContext";
import { PageSearchProvider } from "./contexts/PageSearchContext";
import { ThemeProvider } from "next-themes";
import { AdminLayout } from "./components/layout/AdminLayout";
import { AdminClientViewLayout } from "./components/layout/AdminClientViewLayout";
import { ClientLayout } from "./components/layout/ClientLayout";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPortalType } from "@/lib/domain-config";
import { RouteLoadingBar } from "@/components/common/RouteLoadingBar";
import { GlobalErrorBoundary } from "@/components/common/GlobalErrorBoundary";

// Auth pages
import Login from "./pages/auth/LoginNew";
import Signup from "./pages/auth/Signup";
import PlanSelection from "./pages/auth/PlanSelection";
import PaymentSuccess from "./pages/auth/PaymentSuccess";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import VerifyEmail from "./pages/auth/VerifyEmail";
import OtpVerify from "./pages/auth/OtpVerify";

// Admin pages (eager imports for instant loading)
import AdminDashboard from "./pages/admin/Dashboard";
import AdminSubAccounts from "./pages/admin/SubAccounts";
import AdminClients from "./pages/admin/Clients";
import AdminOrders from "./pages/admin/Orders";
import AdminSettings from "./pages/admin/Settings";
import AdminDesignRequests from "./pages/admin/DesignRequests";
import AdminProductManagement from "./pages/admin/ProductManagement";
import QuoteEstimatorThemeLab from "./pages/admin/QuoteEstimatorThemeLab";
import QuoteEstimatorPreviews from "./pages/admin/QuoteEstimatorPreviews";
import AdminManufacturing from "./pages/admin/Manufacturing";
import AdminClientDetail from "./pages/admin/ClientDetail";
import AdminUsage from "./pages/admin/Usage";
import AdminSecurity from "./pages/admin/Security";
import AdminAssetSheet from "./pages/admin/AssetSheet";
import AdminMasterDBImport from "./pages/admin/MasterDBImport";
import AdminDiamondPool from "./pages/admin/DiamondPool";
import AdminGemstonePool from "./pages/admin/GemstonePool";
import AdminEmailCampaigns from "./pages/admin/EmailCampaigns";
import Unsubscribe from "./pages/Unsubscribe";
import AdminStaff from "./pages/admin/Staff";
import AdminAiCostCalculator from "./pages/admin/AiCostCalculator";
import AdminRevenueUsage from "./pages/admin/RevenueUsage";
import AdminCadResizeRequests from "./pages/admin/CadResizeRequests";
import AdminCadRequests from "./pages/admin/AdminCadRequests";
import AdminMetalBuying from "./pages/admin/MetalBuyingAdmin";

import AdminAIDataCenter from "./pages/admin/AIDataCenter";
import AdminPlatformHealth from "./pages/admin/PlatformHealth";
import AdminSaaSDashboard from "./pages/admin/SaaSDashboard";
import AdminProductAnalytics from "./pages/admin/ProductAnalytics";
import SystemErrors from "./pages/admin/SystemErrors";

// Client pages (eager imports for instant loading)
import ClientDashboard from "./pages/client/Dashboard";
import ClientCatalog from "./pages/client/Catalog";
import ClientShopify from "./pages/client/Shopify";
import ClientEmbed from "./pages/client/Embed";
import ClientOrders from "./pages/client/Orders";
import ClientSettings from "./pages/client/Settings";
import ClientSavedDesigns from "./pages/client/SavedDesigns";
import ClientAIConfigurator from "./pages/client/AIConfigurator";
import ClientOnboarding from "./pages/client/Onboarding";
import ClientStaff from "./pages/client/Staff";
import ClientLogging from "./pages/client/Logging";
import ClientHelpCenter from "./pages/client/HelpCenter";
import AdminClientQueries from "./pages/admin/ClientQueries";
import ClientLivePrices from "./pages/client/LivePrices";
import ClientDiamondsForm from "./pages/client/DiamondsForm";
import ClientGrillOnboarding from "./pages/client/GrillOnboarding";
import ClientRingFormOnboarding from "./pages/client/RingFormOnboarding";
import ClientCustomEnquiryOnboarding from "./pages/client/CustomEnquiryOnboarding";
import ClientBookings from "./pages/client/Bookings";
import ClientUsage from "./pages/client/Usage";
import ClientCadRequests from "./pages/client/CadRequests";
import ClientMetalBuyingConfig from "./pages/client/MetalBuyingConfig";
import ClientMetalBuyingLeads from "./pages/client/MetalBuyingLeads";
import CreditsSuccess from "./pages/client/CreditsSuccess";

// Other pages (eager)
import NotFound from "./pages/NotFound";
import Status from "./pages/Status";
import AccessDenied from "./pages/AccessDenied";
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

const isWidgetRoute = () => {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  const hostname = window.location.hostname;
  return hostname.startsWith('widget.') || /^\/(embed\/|[a-f0-9-]{8,}|diamonds\/|quote\/|grillz\/|custom-enquiry\/|metal-buying\/)/i.test(pathname);
};

// Suspense fallback for lazy-loaded 3D pages
const LazyFallback = () => {
  const widgetRoute = isWidgetRoute();
  return (
    <div className="flex h-full items-center justify-center p-8" style={widgetRoute ? { backgroundColor: 'transparent' } : undefined}>
      {!widgetRoute && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />}
    </div>
  );
};

// Component to handle initial redirect in development environments
function StartupRedirector() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hostname = window.location.hostname;
    
    // Skip on production domains - SubdomainRouter handles routing
    if (hostname.endsWith('aurezotech.com')) {
      return;
    }
    
    const isDevEnvironment = hostname === "localhost";
    
    // Only redirect once per session using sessionStorage flag
    const hasRedirectedThisSession = sessionStorage.getItem('dev_initial_redirect');
    
    // Auth and public paths that don't need redirect
    const publicPaths = ['/login', '/signup', '/plan-selection', '/payment-success', '/forgot-password', '/reset-password'];
    const isPublicPath = publicPaths.some(path => location.pathname === path);
    const isEmbedPath = location.pathname.startsWith('/embed/') || location.pathname.startsWith('/embed-diamonds/') || location.pathname.startsWith('/embed-quote/') || location.pathname.startsWith('/embed-grillz/') || location.pathname.startsWith('/embed-custom-enquiry/') || location.pathname.startsWith('/embed-metal-buying/');
    
    // Only redirect on FIRST app load to root path in dev environments
    if (isDevEnvironment && !hasRedirectedThisSession) {
      sessionStorage.setItem('dev_initial_redirect', 'true');
      
      // Only sign out and redirect if landing on root path
      if (!isPublicPath && !isEmbedPath && location.pathname === '/') {
        supabase.auth.signOut().then(() => {
          navigate('/login', { replace: true });
        });
      }
    }
  }, [location.pathname, navigate]);

  return null;
}

/** Inner component that provides the current pathname as resetKey to the error boundary */
function RouteAwareErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <GlobalErrorBoundary resetKey={location.pathname}>
      {children}
    </GlobalErrorBoundary>
  );
}

// Subdomain-aware router component
function SubdomainRoutes() {
  const location = useLocation();
  
  const portalType = useMemo(() => {
    const hostname = window.location.hostname;
    return getPortalType(hostname);
  }, []);

  // Development mode - render all routes
  if (portalType === 'development') {
    return (
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-otp" element={<OtpVerify />} />
        <Route path="/plan-selection" element={<PlanSelection />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/status" element={<Status />} />
        <Route path="/access-denied" element={<AccessDenied />} />
      
        {/* Admin Portal */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="sub-accounts" element={<AdminSubAccounts />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="saas-dashboard" element={<AdminSaaSDashboard />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="clients/:id" element={<AdminClientDetail />} />
          <Route path="products" element={<AdminProductManagement />} />
          <Route path="quote-estimator-theme-lab" element={<QuoteEstimatorThemeLab />} />
          <Route path="quote-estimator-previews" element={<QuoteEstimatorPreviews />} />
          <Route path="manufacturing" element={<AdminManufacturing />} />
           <Route path="cad-resize-requests" element={<Navigate to="/admin/cad-requests" replace />} />
           <Route path="cad-requests" element={<AdminCadRequests />} />
           <Route path="client-queries" element={<AdminClientQueries />} />
           <Route path="metal-buying" element={<AdminMetalBuying />} />
          <Route path="design-requests" element={<AdminDesignRequests />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="analytics" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="usage" element={<AdminUsage />} />
          <Route path="alerts" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="data-governance" element={<Navigate to="/admin/settings" replace />} />
          <Route path="asset-sheet" element={<AdminAssetSheet />} />
          <Route path="asset-upload" element={<Navigate to="/admin/products" replace />} />
          <Route path="ai-cost-calculator" element={<AdminAiCostCalculator />} />
          <Route path="revenue-usage" element={<AdminRevenueUsage />} />
          <Route path="diamond-pricing-sandbox" element={<Navigate to="/admin/products" replace />} />
          <Route path="ai-data-center" element={<AdminAIDataCenter />} />
           <Route path="platform-health" element={<AdminPlatformHealth />} />
           <Route path="product-analytics" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="master-db-import" element={<AdminMasterDBImport />} />
          <Route path="diamond-pool" element={<AdminDiamondPool />} />
          <Route path="gemstone-pool" element={<AdminGemstonePool />} />
          <Route path="email-campaigns" element={<AdminEmailCampaigns />} />
          <Route path="settings" element={<AdminSettings />} />
           <Route path="staff" element={<Navigate to="/admin/settings" replace />} />
            <Route path="logging" element={<Navigate to="/admin/settings" replace />} />
             <Route path="system-errors" element={<SystemErrors />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          {/* Admin Client View (impersonation) */}
        <Route path="/admin/view-as" element={<AdminClientViewLayout />}>
          <Route index element={<Navigate to="/admin/view-as/dashboard" replace />} />
          <Route path="dashboard" element={<ClientDashboard />} />
          <Route path="catalog" element={<FeatureGuard feature="product_catalogue"><ClientCatalog /></FeatureGuard>} />
          <Route path="live-prices" element={<ClientLivePrices />} />
          <Route path="embed" element={<FeatureGuard feature="embed_branding"><ClientEmbed /></FeatureGuard>} />
          <Route path="ai-configurator" element={<FeatureGuard feature="jewlx_agent"><ClientAIConfigurator /></FeatureGuard>} />
          <Route path="shopify" element={<ClientShopify />} />
          <Route path="orders" element={<FeatureGuard feature="orders"><ClientOrders /></FeatureGuard>} />
          <Route path="saved-designs" element={<ClientSavedDesigns />} />
          <Route path="cad-requests" element={<ClientCadRequests />} />
          <Route path="bookings" element={<Navigate to="../saved-designs" replace />} />
          <Route path="diamonds-form" element={<FeatureGuard anyOf={CUSTOM_X_FEATURE_KEYS}><ClientDiamondsForm /></FeatureGuard>} />
          <Route path="settings" element={<ClientSettings />} />
          <Route path="staff" element={<ClientStaff />} />
          <Route path="logging" element={<ClientLogging />} />
          <Route path="help-center" element={<ClientHelpCenter />} />
          <Route path="ring-form-onboarding" element={<ClientRingFormOnboarding />} />
          <Route path="grill-onboarding" element={<ClientGrillOnboarding />} />
           <Route path="custom-enquiry-onboarding" element={<ClientCustomEnquiryOnboarding />} />
           <Route path="metal-buying-config" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingConfig /></FeatureGuard>} />
           <Route path="metal-buying-leads" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingLeads /></FeatureGuard>} />
         </Route>

        {/* Client Portal */}
        <Route path="/client/onboarding" element={<ClientOnboarding />} />
        <Route path="/client/grill-onboarding" element={<ClientGrillOnboarding />} />
        <Route path="/client/ring-form-onboarding" element={<ClientRingFormOnboarding />} />
        <Route path="/client/custom-enquiry-onboarding" element={<ClientCustomEnquiryOnboarding />} />
        <Route path="/dashboard" element={<ClientLayout />}>
          <Route index element={<ClientDashboard />} />
          <Route path="catalog" element={<FeatureGuard feature="product_catalogue"><ClientCatalog /></FeatureGuard>} />
          <Route path="live-prices" element={<ClientLivePrices />} />
          <Route path="embed" element={<FeatureGuard feature="embed_branding"><ClientEmbed /></FeatureGuard>} />
          <Route path="ai-configurator" element={<FeatureGuard feature="jewlx_agent"><ClientAIConfigurator /></FeatureGuard>} />
          <Route path="shopify" element={<ClientShopify />} />
          <Route path="orders" element={<FeatureGuard feature="orders"><ClientOrders /></FeatureGuard>} />
          <Route path="saved-designs" element={<ClientSavedDesigns />} />
          <Route path="cad-requests" element={<ClientCadRequests />} />
          <Route path="bookings" element={<Navigate to="../saved-designs" replace />} />
          <Route path="staff" element={<ClientStaff />} />
          <Route path="logging" element={<ClientLogging />} />
          <Route path="help-center" element={<ClientHelpCenter />} />
          <Route path="settings" element={<ClientSettings />} />
           <Route path="diamonds-form" element={<FeatureGuard anyOf={CUSTOM_X_FEATURE_KEYS}><ClientDiamondsForm /></FeatureGuard>} />
           <Route path="metal-buying-config" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingConfig /></FeatureGuard>} />
           <Route path="metal-buying-leads" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingLeads /></FeatureGuard>} />
           <Route path="profile" element={<Profile />} />
         </Route>

        {/* Embed configurator (public) - development uses /embed/:clientId */}
        <Route path="/embed/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedConfigurator /></Suspense>} />
        <Route path="/embed-diamonds/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
        <Route path="/embed-quote/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />

        <Route path="/embed-grillz/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedGrillzForm /></Suspense>} />
        <Route path="/embed-custom-enquiry/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedCustomEnquiry /></Suspense>} />
        <Route path="/embed-metal-buying/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedMetalBuying /></Suspense>} />


        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  // Production routing based on subdomain
  const currentPath = location.pathname;

  // Admin portal (studioadmin.aurezotech.com)
  if (portalType === 'admin') {
    if (
      currentPath === '/' ||
      currentPath === '/login' ||
      currentPath === '/forgot-password' ||
      currentPath === '/reset-password' ||
      currentPath === '/verify-otp' ||
      currentPath.startsWith('/admin') ||
      currentPath === '/status'
    ) {
      return (
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-otp" element={<OtpVerify />} />
          <Route path="/status" element={<Status />} />
          
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="sub-accounts" element={<AdminSubAccounts />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="saas-dashboard" element={<AdminSaaSDashboard />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="clients/:id" element={<AdminClientDetail />} />
            <Route path="products" element={<AdminProductManagement />} />
            <Route path="quote-estimator-theme-lab" element={<QuoteEstimatorThemeLab />} />
            <Route path="quote-estimator-previews" element={<QuoteEstimatorPreviews />} />
            <Route path="manufacturing" element={<AdminManufacturing />} />
            <Route path="cad-resize-requests" element={<AdminCadResizeRequests />} />
            <Route path="cad-requests" element={<AdminCadRequests />} />
            <Route path="client-queries" element={<AdminClientQueries />} />
            <Route path="metal-buying" element={<AdminMetalBuying />} />
            <Route path="design-requests" element={<AdminDesignRequests />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="analytics" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="usage" element={<AdminUsage />} />
            <Route path="alerts" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="data-governance" element={<Navigate to="/admin/settings" replace />} />
            <Route path="asset-sheet" element={<AdminAssetSheet />} />
            <Route path="asset-upload" element={<Navigate to="/admin/products" replace />} />
            <Route path="ai-cost-calculator" element={<AdminAiCostCalculator />} />
            <Route path="revenue-usage" element={<AdminRevenueUsage />} />
            <Route path="diamond-pricing-sandbox" element={<Navigate to="/admin/products" replace />} />
            
            <Route path="ai-data-center" element={<AdminAIDataCenter />} />
            <Route path="platform-health" element={<AdminPlatformHealth />} />
            <Route path="master-db-import" element={<AdminMasterDBImport />} />
            <Route path="diamond-pool" element={<AdminDiamondPool />} />
            <Route path="gemstone-pool" element={<AdminGemstonePool />} />
          <Route path="email-campaigns" element={<AdminEmailCampaigns />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="logging" element={<Navigate to="/admin/settings" replace />} />
            <Route path="system-errors" element={<SystemErrors />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          {/* Admin Client View (impersonation) */}
          <Route path="/admin/view-as" element={<AdminClientViewLayout />}>
            <Route index element={<Navigate to="/admin/view-as/dashboard" replace />} />
            <Route path="dashboard" element={<ClientDashboard />} />
            <Route path="catalog" element={<FeatureGuard feature="product_catalogue"><ClientCatalog /></FeatureGuard>} />
            <Route path="live-prices" element={<ClientLivePrices />} />
            <Route path="embed" element={<FeatureGuard feature="embed_branding"><ClientEmbed /></FeatureGuard>} />
            <Route path="ai-configurator" element={<FeatureGuard feature="jewlx_agent"><ClientAIConfigurator /></FeatureGuard>} />
            <Route path="shopify" element={<ClientShopify />} />
            <Route path="orders" element={<FeatureGuard feature="orders"><ClientOrders /></FeatureGuard>} />
            <Route path="saved-designs" element={<ClientSavedDesigns />} />
            <Route path="cad-requests" element={<ClientCadRequests />} />
             <Route path="bookings" element={<Navigate to="../saved-designs" replace />} />
            <Route path="diamonds-form" element={<FeatureGuard anyOf={CUSTOM_X_FEATURE_KEYS}><ClientDiamondsForm /></FeatureGuard>} />
            <Route path="settings" element={<ClientSettings />} />
             <Route path="staff" element={<ClientStaff />} />
             <Route path="logging" element={<ClientLogging />} />
             <Route path="help-center" element={<ClientHelpCenter />} />
             <Route path="usage" element={<ClientUsage />} />
             <Route path="ring-form-onboarding" element={<ClientRingFormOnboarding />} />
             <Route path="grill-onboarding" element={<ClientGrillOnboarding />} />
              <Route path="custom-enquiry-onboarding" element={<ClientCustomEnquiryOnboarding />} />
              <Route path="metal-buying-config" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingConfig /></FeatureGuard>} />
              <Route path="metal-buying-leads" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingLeads /></FeatureGuard>} />
          </Route>

          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      );
    }
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Client portal (studio.aurezotech.com)
  if (portalType === 'client') {
    if (
      currentPath === '/' ||
      currentPath === '/login' ||
      currentPath === '/signup' ||
      currentPath === '/forgot-password' ||
      currentPath === '/reset-password' ||
      currentPath === '/verify-email' ||
      currentPath === '/verify-otp' ||
      currentPath === '/plan-selection' ||
      currentPath === '/payment-success' ||
      currentPath === '/credits-success' ||
      currentPath.startsWith('/client') ||
      currentPath.startsWith('/dashboard') ||
      currentPath.startsWith('/embed/') ||
      currentPath.startsWith('/embed-diamonds/') ||
      currentPath.startsWith('/embed-quote/') ||
      currentPath.startsWith('/embed-grillz/') ||
      currentPath.startsWith('/embed-custom-enquiry/') ||
      currentPath.startsWith('/embed-metal-buying/') ||
      currentPath === '/status'
    ) {
      return (
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verify-otp" element={<OtpVerify />} />
          <Route path="/plan-selection" element={<PlanSelection />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/credits-success" element={<CreditsSuccess />} />
          <Route path="/status" element={<Status />} />
          
          {/* Public embed routes - no authentication required */}
          <Route path="/embed/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedConfigurator /></Suspense>} />
          <Route path="/embed-diamonds/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
          <Route path="/embed-quote/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
          <Route path="/embed-grillz/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedGrillzForm /></Suspense>} />
          <Route path="/embed-custom-enquiry/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedCustomEnquiry /></Suspense>} />
          <Route path="/embed-metal-buying/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedMetalBuying /></Suspense>} />
          
          <Route path="/client/onboarding" element={<ClientOnboarding />} />
          <Route path="/client/grill-onboarding" element={<ClientGrillOnboarding />} />
          <Route path="/client/ring-form-onboarding" element={<ClientRingFormOnboarding />} />
          <Route path="/client/custom-enquiry-onboarding" element={<ClientCustomEnquiryOnboarding />} />
          <Route path="/dashboard" element={<ClientLayout />}>
            <Route index element={<ClientDashboard />} />
            <Route path="catalog" element={<FeatureGuard feature="product_catalogue"><ClientCatalog /></FeatureGuard>} />
            <Route path="live-prices" element={<ClientLivePrices />} />
            <Route path="embed" element={<FeatureGuard feature="embed_branding"><ClientEmbed /></FeatureGuard>} />
            <Route path="ai-configurator" element={<FeatureGuard feature="jewlx_agent"><ClientAIConfigurator /></FeatureGuard>} />
            <Route path="shopify" element={<ClientShopify />} />
            <Route path="orders" element={<FeatureGuard feature="orders"><ClientOrders /></FeatureGuard>} />
            <Route path="saved-designs" element={<ClientSavedDesigns />} />
            <Route path="cad-requests" element={<ClientCadRequests />} />
            <Route path="bookings" element={<Navigate to="../saved-designs" replace />} />
            <Route path="staff" element={<ClientStaff />} />
            <Route path="logging" element={<ClientLogging />} />
            <Route path="help-center" element={<ClientHelpCenter />} />
            <Route path="settings" element={<ClientSettings />} />
            <Route path="diamonds-form" element={<FeatureGuard anyOf={CUSTOM_X_FEATURE_KEYS}><ClientDiamondsForm /></FeatureGuard>} />
            <Route path="metal-buying-config" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingConfig /></FeatureGuard>} />
            <Route path="metal-buying-leads" element={<FeatureGuard feature="metal_buying"><ClientMetalBuyingLeads /></FeatureGuard>} />
            <Route path="usage" element={<ClientUsage />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      );
    }
    return <Navigate to="/login" replace />;
  }

  // Builder portal (widget.aurezotech.com) - public widget
  if (portalType === 'builder') {
    return (
      <Routes>
        {/* Simplified route: widget.aurezotech.com/:clientId */}
        <Route path="/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedConfigurator /></Suspense>} />
        <Route path="/diamonds/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
        <Route path="/quote/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
        <Route path="/embed-diamonds/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
        <Route path="/embed-quote/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedDiamondsForm /></Suspense>} />
        <Route path="/grillz/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedGrillzForm /></Suspense>} />
        <Route path="/embed-grillz/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedGrillzForm /></Suspense>} />
        <Route path="/custom-enquiry/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedCustomEnquiry /></Suspense>} />
        <Route path="/embed-custom-enquiry/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedCustomEnquiry /></Suspense>} />
        <Route path="/metal-buying/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedMetalBuying /></Suspense>} />
        <Route path="/embed-metal-buying/:clientId" element={<Suspense fallback={<LazyFallback />}><EmbedMetalBuying /></Suspense>} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/" element={<Navigate to="/access-denied" replace />} />
        <Route path="*" element={<Navigate to="/access-denied" replace />} />
      </Routes>
    );
  }

  // Fallback - redirect to client portal login
  return <Navigate to="/login" replace />;
}

const App = () => {
  if (typeof document !== 'undefined') {
    document.body.toggleAttribute('data-embed-preload', isWidgetRoute());
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="aurezo-theme" forcedTheme={isWidgetRoute() ? "dark" : undefined}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RouteLoadingBar />
            <StartupRedirector />
            <AuthProvider>
              <AdminImpersonationProvider>
                <PageSearchProvider>
                  <RouteAwareErrorBoundary>
                    <Suspense fallback={<LazyFallback />}>
                      <SubdomainRoutes />
                    </Suspense>
                  </RouteAwareErrorBoundary>
                </PageSearchProvider>
              </AdminImpersonationProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
