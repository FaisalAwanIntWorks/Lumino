import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Download, Trash2, Tag } from 'lucide-react';
import type { StatusTag } from '@/hooks/useClientStatusTags';

interface OrderBulkToolbarProps {
  selectedCount: number;
  statusTags: StatusTag[];
  onBulkStatusChange: (status: string) => void;
  onExportCsv: () => void;
  onBulkDelete: () => void;
}

export default function OrderBulkToolbar({
  selectedCount,
  statusTags,
  onBulkStatusChange,
  onExportCsv,
  onBulkDelete,
}: OrderBulkToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>

      <div className="flex items-center gap-2 ml-auto">
        {/* Bulk status change */}
        <Select onValueChange={onBulkStatusChange}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <Tag className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            {statusTags.map(tag => (
              <SelectItem key={tag.id} value={tag.tag_name}>
                {tag.tag_name.charAt(0).toUpperCase() + tag.tag_name.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Export CSV */}
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onExportCsv}>
          <Download className="h-3 w-3" /> Export CSV
        </Button>

        {/* Bulk delete */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="h-8 gap-1 text-xs">
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedCount} orders?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The selected orders will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
