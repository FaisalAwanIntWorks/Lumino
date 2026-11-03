import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface PageSearchItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ElementType;
  category?: string;
  action: () => void;
}

interface PageSearchContextType {
  pageItems: PageSearchItem[];
  pageName: string | null;
  registerPageSearch: (pageName: string, items: PageSearchItem[]) => void;
  clearPageSearch: () => void;
}

const PageSearchContext = createContext<PageSearchContextType>({
  pageItems: [],
  pageName: null,
  registerPageSearch: () => {},
  clearPageSearch: () => {},
});

export function PageSearchProvider({ children }: { children: ReactNode }) {
  const [pageItems, setPageItems] = useState<PageSearchItem[]>([]);
  const [pageName, setPageName] = useState<string | null>(null);

  const registerPageSearch = useCallback((name: string, items: PageSearchItem[]) => {
    setPageName(name);
    setPageItems(items);
  }, []);

  const clearPageSearch = useCallback(() => {
    setPageName(null);
    setPageItems([]);
  }, []);

  return (
    <PageSearchContext.Provider value={{ pageItems, pageName, registerPageSearch, clearPageSearch }}>
      {children}
    </PageSearchContext.Provider>
  );
}

export const usePageSearchContext = () => useContext(PageSearchContext);
