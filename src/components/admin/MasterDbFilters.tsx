import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface MasterDbFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  styleFilter: string;
  onStyleChange: (value: string) => void;
  shapeFilter: string;
  onShapeChange: (value: string) => void;
  colorFilter: string;
  onColorChange: (value: string) => void;
  shankFilter: string;
  onShankChange: (value: string) => void;
  styles: string[];
  shapes: string[];
  colors: string[];
  shanks: string[];
  totalCount: number;
  filteredCount: number;
}

export function MasterDbFilters({
  searchQuery,
  onSearchChange,
  styleFilter,
  onStyleChange,
  shapeFilter,
  onShapeChange,
  colorFilter,
  onColorChange,
  shankFilter,
  onShankChange,
  styles,
  shapes,
  colors,
  shanks,
  totalCount,
  filteredCount,
}: MasterDbFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={styleFilter} onValueChange={onStyleChange}>
            <SelectTrigger className="w-[130px] sm:w-[140px]">
              <SelectValue placeholder="All Styles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Styles</SelectItem>
              {styles.map((style) => (
                <SelectItem key={style} value={style}>{style}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={shapeFilter} onValueChange={onShapeChange}>
            <SelectTrigger className="w-[130px] sm:w-[140px]">
              <SelectValue placeholder="All Shapes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shapes</SelectItem>
              {shapes.map((shape) => (
                <SelectItem key={shape} value={shape}>{shape}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={colorFilter} onValueChange={onColorChange}>
            <SelectTrigger className="w-[130px] sm:w-[140px]">
              <SelectValue placeholder="All Colors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Colors</SelectItem>
              {colors.map((color) => (
                <SelectItem key={color} value={color}>{color}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={shankFilter} onValueChange={onShankChange}>
            <SelectTrigger className="w-[130px] sm:w-[140px]">
              <SelectValue placeholder="All Shanks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shanks</SelectItem>
              {shanks.map((shank) => (
                <SelectItem key={shank} value={shank}>{shank}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-muted-foreground">
        Showing {filteredCount} of {totalCount} products
      </p>
    </div>
  );
}
