import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface DiamondPaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function DiamondPagination({
  currentPage,
  totalCount,
  pageSize,
  loading,
  onPageChange,
}: DiamondPaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) return null;

  const disabledClass = 'pointer-events-none opacity-50';

  const buildPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: (number | 'ellipsis')[] = [0];
    if (currentPage > 2) pages.push('ellipsis');
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 3) pages.push('ellipsis');
    pages.push(totalPages - 1);
    return pages;
  };

  const start = currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
      <p className="text-sm text-muted-foreground">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {totalCount.toLocaleString()}
      </p>
      <Pagination className="w-auto mx-0">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => onPageChange(currentPage - 1)}
              className={currentPage === 0 || loading ? disabledClass : 'cursor-pointer'}
            />
          </PaginationItem>

          {buildPageNumbers().map((p, idx) =>
            p === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === currentPage}
                  onClick={() => p !== currentPage && onPageChange(p)}
                  className={loading ? disabledClass : p !== currentPage ? 'cursor-pointer' : ''}
                >
                  {p + 1}
                </PaginationLink>
              </PaginationItem>
            )
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() => onPageChange(currentPage + 1)}
              className={currentPage >= totalPages - 1 || loading ? disabledClass : 'cursor-pointer'}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
