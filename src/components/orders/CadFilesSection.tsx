
import { useState, useEffect } from "react";
import { FileDown, Loader2, Send, Mail, ChevronDown, ChevronUp, AlertTriangle, Info, Ruler, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CadFilesSectionProps {
  cadLoading: boolean;
  cadFileUrl: string | null;
  cadFiles: string[];
  order: {
    id?: string;
    shopify_order_id: string | null;
    configuration: Record<string, unknown> | null;
    client_id?: string;
  } | null;
  clientCompanyName?: string;
}

function extractRingSize(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const sizeVal = config["Size"] || config["Ring Size"] || config["size"] || config["ring_size"];
  return sizeVal ? String(sizeVal) : null;
}

export function CadFilesSection({ cadLoading, cadFileUrl, cadFiles, order, clientCompanyName }: CadFilesSectionProps) {
  const [showEmailForm, setShowEmailForm] = useState<string | false>(false);
  const [emailInput, setEmailInput] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [resizeRequesting, setResizeRequesting] = useState(false);
  const [resizeSubmitted, setResizeSubmitted] = useState(false);

  // Check for existing resize request on mount
  useEffect(() => {
    if (!order?.id) return;
    const checkExisting = async () => {
      const { data } = await supabase
        .from("cad_resize_requests")
        .select("id")
        .eq("order_id", order.id)
        .limit(1);
      if (data && data.length > 0) {
        setResizeSubmitted(true);
      }
    };
    checkExisting();
  }, [order?.id]);
  const hasCadFiles = cadFileUrl || cadFiles.length > 0;
  const orderRingSize = extractRingSize(order?.configuration || null);
  const isSizeMismatch = orderRingSize && orderRingSize !== "6";

  const handleRequestResize = async () => {
    if (!order?.id || !order?.client_id || !orderRingSize) {
      toast.error("Missing order information");
      return;
    }

    setResizeRequesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to request a resize");
        return;
      }

      const config = order.configuration || {};
      const styleVal = String(config["Style"] || config["style"] || "");
      const shapeVal = String(config["Shape"] || config["shape"] || "");
      const metalVal = String(config["Metal"] || config["metal"] || "");
      const caratVal = String(config["Carat Range"] || config["carat_range"] || "");
      const productName = [styleVal, shapeVal, caratVal, metalVal].filter(Boolean).join(" · ") || "Ring";
      const orderNumber = order.shopify_order_id || (config as any).shopify_order_number || order.id.slice(0, 8);

      const { error } = await supabase.from("cad_resize_requests").insert({
        order_id: order.id,
        client_id: order.client_id,
        requested_by: session.user.id,
        current_size: "6",
        requested_size: orderRingSize,
        product_name: productName,
        metal_type: metalVal || null,
        style: styleVal || null,
        shape: shapeVal || null,
      });

      if (error) throw error;
      setResizeSubmitted(true);

      // Notify admins via email
      try {
        await supabase.functions.invoke("notify-cad-resize", {
          body: {
            client_company: clientCompanyName || "Unknown Client",
            order_number: String(orderNumber),
            current_size: "6",
            requested_size: orderRingSize,
            product_name: productName,
            metal_type: metalVal || undefined,
            style: styleVal || undefined,
            shape: shapeVal || undefined,
          },
        });
      } catch (notifyErr) {
        console.error("Failed to send admin notification:", notifyErr);
      }
    } catch (err: any) {
      if (err?.code === "23505") {
        setResizeSubmitted(true);
      } else {
        console.error("Error requesting resize:", err);
        toast.error("Failed to submit resize request");
      }
    } finally {
      setResizeRequesting(false);
    }
  };

  const handleSendCadEmail = async (fileUrl: string) => {
    const emails = emailInput
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      toast.error("Please enter at least one email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.find((e) => !emailRegex.test(e));
    if (invalid) {
      toast.error(`Invalid email: ${invalid}`);
      return;
    }

    if (emails.length > 10) {
      toast.error("Maximum 10 email addresses allowed");
      return;
    }

    const config = order?.configuration || {};
    const orderNumber = order?.shopify_order_id || (config as any).shopify_order_number || "N/A";
    const configSummary = config as Record<string, unknown>;
    const productName = [
      configSummary.Style,
      configSummary.Shape,
      configSummary["Carat Range"],
      configSummary.Metal,
    ]
      .filter(Boolean)
      .join(" · ") || "Ring";

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to send emails");
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-cad-email", {
        body: {
          emails,
          message: customMessage || undefined,
          cad_file_url: fileUrl,
          order_number: String(orderNumber),
          product_name: productName,
          ring_size: orderRingSize || "6",
        },
      });

      if (error) throw error;

      const successCount = data?.results?.filter((r: any) => r.success).length || 0;
      toast.success(`CAD file sent to ${successCount} recipient${successCount !== 1 ? "s" : ""}`);
      setEmailInput("");
      setCustomMessage("");
      setShowEmailForm(false);
    } catch (err) {
      console.error("Error sending CAD email:", err);
      toast.error("Failed to send CAD file email");
    } finally {
      setSending(false);
    }
  };

  const renderEmailForm = (fileUrl?: string) => {
    const url = fileUrl || cadFileUrl || cadFiles[0];
    if (!url) return null;

    return (
      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Recipient Emails
          </label>
          <Input
            placeholder="Enter emails separated by commas"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Separate multiple emails with commas (max 10)
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Custom Message <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <Textarea
            placeholder="Add a note for the manufacturer..."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="text-sm min-h-[70px]"
            maxLength={2000}
          />
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => handleSendCadEmail(url)}
          disabled={sending || !emailInput.trim()}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {sending ? "Sending…" : "Send CAD File"}
        </Button>
      </div>
    );
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">CAD Files</h3>
      {cadLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading CAD files…
        </div>
      ) : hasCadFiles ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {cadFileUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <FileDown className="h-4 w-4 text-muted-foreground" />
                    Manufacture CAD File
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs"
                    onClick={() => setShowEmailForm(showEmailForm === "main" ? false : "main")}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Send via Email
                    {showEmailForm === "main" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
                {showEmailForm === "main" && renderEmailForm()}
              </div>
            )}
            {cadFiles.map((url, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <FileDown className="h-4 w-4 text-muted-foreground" />
                    CAD File {idx + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs"
                    onClick={() => setShowEmailForm(showEmailForm === `cad-${idx}` ? false : `cad-${idx}`)}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Send via Email
                    {showEmailForm === `cad-${idx}` ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
                {showEmailForm === `cad-${idx}` && renderEmailForm(url)}
              </div>
            ))}
          </div>

          {/* Ring Size Warning / Acknowledgment */}
          {isSizeMismatch ? (
            resizeSubmitted ? (
              <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-700 dark:text-green-400">
                      Resize Request Submitted
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Your resize request for <strong>Size {orderRingSize}</strong> has been submitted to Aurezo admin. You will receive an update soon.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      CAD File — Ring Size 6
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      The ring size is standardized at 6 and the carat size of above CAD file is standardized at 3. If you want your manufacturer or designer to change this, you can send this file via email OR if you want us to change it, please request a CAD design resize request — we will send it to you within 24 to 48 hours on this platform.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs border-amber-500/40 hover:bg-amber-500/10"
                  onClick={handleRequestResize}
                  disabled={resizeRequesting}
                >
                  {resizeRequesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ruler className="h-3.5 w-3.5" />
                  )}
                  {resizeRequesting ? "Submitting…" : "Request CAD Resize"}
                </Button>
              </div>
            )
          ) : (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>The ring size is standardized at 6 and the carat size of above CAD file is standardized at 3. If you want your manufacturer or designer to change this, you can send this file via email OR if you want us to change it, please request a CAD design resize request — we will send it to you within 24 to 48 hours on this platform.</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No CAD files available yet</p>
      )}
    </section>
  );
}
