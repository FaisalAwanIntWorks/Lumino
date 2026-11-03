CREATE TRIGGER on_metal_buying_lead_created
  AFTER INSERT ON public.metal_buying_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();