export const calculateRetailPrice = (baseCost: number, markupPercentage: number): number => {
  return Math.round(baseCost * (1 + markupPercentage / 100));
};

export const calculateMarkupAmount = (baseCost: number, markupPercentage: number): number => {
  return Math.round(baseCost * (markupPercentage / 100));
};

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const getCurrencySymbol = (currency: string = 'USD'): string => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0);
  return formatted.replace(/[\d.,\s]/g, '').trim();
};

export const formatPercentage = (value: number): string => {
  return `${value}%`;
};

export const formatCartPrice = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};
