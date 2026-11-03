import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RingConfiguration } from '@/types/ring-builder';

interface ShareButtonProps {
  configuration: RingConfiguration;
}

export const ShareButton = ({ configuration }: ShareButtonProps) => {
  const { toast } = useToast();

  const handleShare = async () => {
    try {
      const configStr = btoa(JSON.stringify(configuration));
      const shareUrl = `${window.location.origin}/custom-builder?config=${configStr}`;
      
      await navigator.clipboard.writeText(shareUrl);
      toast({ 
        title: "Link copied!", 
        description: "Share this link with anyone to show your design" 
      });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to copy link", 
        variant: "destructive" 
      });
    }
  };

  return (
    <button
      onClick={handleShare}
      className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 rounded-full transition-all duration-300"
      title="Share design"
    >
      <Share2 className="w-4 h-4 md:w-5 md:h-5 text-white" />
    </button>
  );
};
