import { useState, useEffect } from "react";
import { useClientTimezone, formatDateWithTimezone } from "@/hooks/useClientTimezone";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Upload, X, Image as ImageIcon } from "lucide-react";
import { useClientCurrency } from "@/hooks/useClientCurrency";
import { getCurrencySymbol } from "@/lib/pricing-utils";

const BUDGET_RANGE_KEYS = ["under_1000", "1000_2500", "2500_5000", "5000_10000", "over_10000"] as const;

const budgetRangeLabel = (key: string, symbol: string): string => {
  const amt = (n: number) => `${symbol}${n.toLocaleString()}`;
  switch (key) {
    case "under_1000": return `Under ${amt(1000)}`;
    case "1000_2500": return `${amt(1000)} - ${amt(2500)}`;
    case "2500_5000": return `${amt(2500)} - ${amt(5000)}`;
    case "5000_10000": return `${amt(5000)} - ${amt(10000)}`;
    case "over_10000": return `Over ${amt(10000)}`;
    default: return key;
  }
};

interface DesignRequest {
  id: string;
  request_type: string;
  description: string;
  status: string;
  priority: string;
  budget_range: string | null;
  timeline: string | null;
  metal_preference: string | null;
  stone_preference: string | null;
  size: string | null;
  special_requirements: string | null;
  reference_images: string[] | null;
  created_at: string;
  admin_notes: string | null;
}

const DesignRequests = () => {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const clientTimezone = useClientTimezone();
  const { currency: clientCurrency } = useClientCurrency(impersonatedClientId || undefined);
  const currencySymbol = getCurrencySymbol(clientCurrency);
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    request_type: "custom_ring",
    description: "",
    budget_range: "",
    timeline: "",
    metal_preference: "",
    stone_preference: "",
    size: "",
    special_requirements: "",
  });

  useEffect(() => {
    if (isImpersonating && !impersonatedClientId) return;
    fetchRequests();
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchRequests = async () => {
    try {
      let clientId: string | null = null;

      if (isImpersonating && impersonatedClientId) {
        clientId = impersonatedClientId;
      } else {
        const { data: clientData, error } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user?.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        clientId = clientData?.id || null;
      }

      if (!clientId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("design_requests")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      toast.error("Failed to load design requests");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 5 - uploadedImages.length;
    const filesToAdd = files.slice(0, remaining);
    
    setUploadedImages([...uploadedImages, ...filesToAdd]);
  };

  const removeImage = (index: number) => {
    setUploadedImages(uploadedImages.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let clientId: string | null = null;

      if (isImpersonating && impersonatedClientId) {
        clientId = impersonatedClientId;
      } else {
        const { data: clientData, error } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user?.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        clientId = clientData?.id || null;
      }

      if (!clientId) {
        toast.error("Client not found");
        return;
      }

      // TODO: Upload images to Supabase Storage
      const imageUrls: string[] = [];

      const { error } = await supabase.from("design_requests").insert({
        client_id: clientId,
        request_type: formData.request_type,
        description: formData.description,
        budget_range: formData.budget_range || null,
        timeline: formData.timeline || null,
        metal_preference: formData.metal_preference || null,
        stone_preference: formData.stone_preference || null,
        size: formData.size || null,
        special_requirements: formData.special_requirements || null,
        reference_images: imageUrls.length > 0 ? imageUrls : null,
        status: "submitted",
        priority: "normal",
      });

      if (error) throw error;

      toast.success("Design request submitted successfully");
      setDialogOpen(false);
      setFormData({
        request_type: "custom_ring",
        description: "",
        budget_range: "",
        timeline: "",
        metal_preference: "",
        stone_preference: "",
        size: "",
        special_requirements: "",
      });
      setUploadedImages([]);
      fetchRequests();
    } catch (error: any) {
      toast.error("Failed to submit request");
      console.error(error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "in_review":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "approved":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "in_production":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "rejected":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-secondary";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "normal":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "low":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-secondary";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Design Requests</h1>
          <p className="text-muted-foreground">
            Request custom jewelry designs from our team
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Design Request
        </Button>
      </div>

      <div className="grid gap-4">
        {requests.length === 0 ? (
          <Card className="p-12 text-center">
            <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Design Requests Yet</h3>
            <p className="text-muted-foreground mb-4">
              Start by submitting your first custom jewelry design request
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Request
            </Button>
          </Card>
        ) : (
          requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">
                        {request.request_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </CardTitle>
                      <Badge className={getStatusColor(request.status)}>
                        {request.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge className={getPriorityColor(request.priority)}>
                        {request.priority}
                      </Badge>
                    </div>
                    <CardDescription>
                      Submitted on {formatDateWithTimezone(request.created_at, clientTimezone)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">{request.description}</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {request.metal_preference && (
                      <div>
                        <span className="text-muted-foreground">Metal:</span>
                        <p className="font-medium">{request.metal_preference}</p>
                      </div>
                    )}
                    {request.stone_preference && (
                      <div>
                        <span className="text-muted-foreground">Stone:</span>
                        <p className="font-medium">{request.stone_preference}</p>
                      </div>
                    )}
                    {request.size && (
                      <div>
                        <span className="text-muted-foreground">Size:</span>
                        <p className="font-medium">{request.size}</p>
                      </div>
                    )}
                    {request.budget_range && (
                      <div>
                        <span className="text-muted-foreground">Budget:</span>
                        <p className="font-medium">{budgetRangeLabel(request.budget_range, currencySymbol)}</p>
                      </div>
                    )}
                  </div>

                  {request.special_requirements && (
                    <div>
                      <h4 className="font-medium mb-1">Special Requirements</h4>
                      <p className="text-sm text-muted-foreground">{request.special_requirements}</p>
                    </div>
                  )}

                  {request.admin_notes && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-1">Admin Notes</h4>
                      <p className="text-sm text-muted-foreground">{request.admin_notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request a New Jewelry Design</DialogTitle>
            <DialogDescription>
              Tell us about your vision and our design team will bring it to life
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="request_type">Design Type *</Label>
              <Select
                value={formData.request_type}
                onValueChange={(value) => setFormData({ ...formData, request_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom_ring">Custom Ring</SelectItem>
                  <SelectItem value="custom_grill">Custom Grill</SelectItem>
                  <SelectItem value="modification">Modification</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference_images">Reference Images (Up to 5)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <Input
                  id="reference_images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadedImages.length >= 5}
                />
                <Label
                  htmlFor="reference_images"
                  className={`cursor-pointer flex flex-col items-center gap-2 ${
                    uploadedImages.length >= 5 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload reference images ({uploadedImages.length}/5)
                  </span>
                </Label>
              </div>

              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {uploadedImages.map((file, index) => (
                    <div key={index} className="relative aspect-square border rounded-lg overflow-hidden">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Reference ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => removeImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Design Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe your jewelry vision in detail... What style are you looking for? Any specific features or inspirations?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                rows={6}
                className="resize-none"
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Configuration Requirements</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="metal_preference">Metal Type</Label>
                  <Select
                    value={formData.metal_preference}
                    onValueChange={(value) => setFormData({ ...formData, metal_preference: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select metal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14k_yellow_gold">14K Yellow Gold</SelectItem>
                      <SelectItem value="14k_white_gold">14K White Gold</SelectItem>
                      <SelectItem value="14k_rose_gold">14K Rose Gold</SelectItem>
                      <SelectItem value="18k_yellow_gold">18K Yellow Gold</SelectItem>
                      <SelectItem value="platinum">Platinum</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stone_preference">Stone Type</Label>
                  <Select
                    value={formData.stone_preference}
                    onValueChange={(value) => setFormData({ ...formData, stone_preference: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diamond">Diamond</SelectItem>
                      <SelectItem value="moissanite">Moissanite</SelectItem>
                      <SelectItem value="sapphire">Sapphire</SelectItem>
                      <SelectItem value="ruby">Ruby</SelectItem>
                      <SelectItem value="emerald">Emerald</SelectItem>
                      <SelectItem value="none">No Stone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="size">Size</Label>
                  <Input
                    id="size"
                    placeholder="e.g., Ring size 7, Top 8 Bottom 6"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="budget_range">Budget Range</Label>
                  <Select
                    value={formData.budget_range}
                    onValueChange={(value) => setFormData({ ...formData, budget_range: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select budget" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_RANGE_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>{budgetRangeLabel(key, currencySymbol)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="special_requirements">Special Requirements or Customizations</Label>
              <Textarea
                id="special_requirements"
                placeholder="Any engraving, unique features, or special requests?"
                value={formData.special_requirements}
                onChange={(e) => setFormData({ ...formData, special_requirements: e.target.value })}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeline">Timeline</Label>
              <Select
                value={formData.timeline}
                onValueChange={(value) => setFormData({ ...formData, timeline: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="When do you need this?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rush">Rush (1-2 weeks)</SelectItem>
                  <SelectItem value="standard">Standard (3-4 weeks)</SelectItem>
                  <SelectItem value="flexible">Flexible (4+ weeks)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Submit Request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DesignRequests;
