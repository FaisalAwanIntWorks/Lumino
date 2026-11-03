import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, X, Tag, ChevronDown } from 'lucide-react';
import type { StatusTag } from '@/hooks/useClientStatusTags';
import { TAG_COLOR_PRESETS } from '@/hooks/useClientStatusTags';

interface StatusTagSelectorProps {
  currentStatus: string;
  tags: StatusTag[];
  onStatusChange: (newStatus: string) => void;
  onCreateTag?: (tagName: string, tagColor: string) => void;
  onDeleteTag?: (tagId: string) => void;
  getTagColor: (tagName: string) => string;
  disabled?: boolean;
}

export function StatusTagSelector({
  currentStatus,
  tags,
  onStatusChange,
  onCreateTag,
  onDeleteTag,
  getTagColor,
  disabled = false,
}: StatusTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PRESETS[0].value);

  const handleSelect = (tagName: string) => {
    onStatusChange(tagName);
    setOpen(false);
  };

  const handleCreate = () => {
    if (!newTagName.trim() || !onCreateTag) return;
    onCreateTag(newTagName.trim(), newTagColor);
    setNewTagName('');
    setShowCreate(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          className={`rounded-full transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            disabled ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
          }`}
          type="button"
          title={disabled ? undefined : 'Change status'}
          aria-label={disabled ? `Status: ${currentStatus}` : `Status: ${currentStatus}. Click to change`}
        >
          {/* The chevron is what tells the user this pill is a dropdown and not
              just a read-only badge like the ones in the leads table. */}
          <Badge className={`${getTagColor(currentStatus)} text-xs gap-1 ${disabled ? '' : 'cursor-pointer pr-2'}`}>
            {currentStatus}
            {!disabled && <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Change status</p>
          {tags.map(tag => (
            <div
              key={tag.id}
              className="flex items-center gap-1"
            >
              <button
                onClick={() => handleSelect(tag.tag_name)}
                className="flex-1 text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors"
                type="button"
              >
                <Badge className={`${tag.tag_color} text-[10px]`}>{tag.tag_name}</Badge>
              </button>
              {onDeleteTag && !tag.is_default && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTag(tag.id);
                  }}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Delete tag"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          
          {onCreateTag && (
            <>
              <div className="border-t border-border my-1" />
              {showCreate ? (
                <div className="space-y-2 p-2">
                  <Input
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    placeholder="Tag name..."
                    className="h-7 text-xs"
                    maxLength={30}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                  <div className="flex flex-wrap gap-1">
                    {TAG_COLOR_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setNewTagColor(preset.value)}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          newTagColor === preset.value ? 'border-foreground scale-110' : 'border-transparent'
                        }`}
                      >
                        <Badge className={`${preset.value} w-full h-full rounded-full p-0`} />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="default" className="h-6 text-xs flex-1" onClick={handleCreate} disabled={!newTagName.trim()}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowCreate(false); setNewTagName(''); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 hover:bg-accent transition-colors text-muted-foreground"
                  type="button"
                >
                  <Plus className="h-3 w-3" />
                  Create new tag
                </button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
