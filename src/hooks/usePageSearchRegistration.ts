import { useEffect } from 'react';
import { usePageSearchContext, PageSearchItem } from '@/contexts/PageSearchContext';

/**
 * Hook for pages to register their searchable content with the global search.
 * Content is automatically unregistered when the component unmounts.
 */
export function usePageSearchRegistration(pageName: string, items: PageSearchItem[]) {
  const { registerPageSearch, clearPageSearch } = usePageSearchContext();

  useEffect(() => {
    if (items.length > 0) {
      registerPageSearch(pageName, items);
    }
    return () => clearPageSearch();
  }, [pageName, items, registerPageSearch, clearPageSearch]);
}
