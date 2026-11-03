import { WalletCard } from '@/components/client/usage/WalletCard';
import { Wallet } from 'lucide-react';

export default function Usage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Wallet className="h-8 w-8" />
          AI Credits
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your AI credits, view transaction history, and top up your wallet
        </p>
      </div>

      <WalletCard />
    </div>
  );
}
