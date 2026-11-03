import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { useNavigate } from 'react-router-dom';

export const ImpersonationBanner = () => {
  const { impersonatedClientName, stopImpersonation, isImpersonating } = useAdminImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating) return null;

  const handleExit = () => {
    stopImpersonation();
    // Always navigate to admin clients page (we stay on admin domain now)
    navigate('/admin/clients');
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5" />
        <span className="font-medium">
          Viewing as <strong>{impersonatedClientName}</strong>
        </span>
      </div>
      <Button
        onClick={handleExit}
        variant="ghost"
        size="sm"
        className="text-amber-950 hover:text-amber-950 hover:bg-amber-600"
      >
        <X className="h-4 w-4 mr-1" />
        Exit Admin View
      </Button>
    </div>
  );
};
