import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Diamond, Sparkles } from "lucide-react";
import { DIAMOND_TYPES } from "@/data/diamond-presets";

interface DiamondTypeSelectorProps {
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
}

export function DiamondTypeSelector({ selectedTypes, onTypesChange }: DiamondTypeSelectorProps) {
  const toggleType = (typeId: string) => {
    if (selectedTypes.includes(typeId)) {
      onTypesChange(selectedTypes.filter(t => t !== typeId));
    } else {
      onTypesChange([...selectedTypes, typeId]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          What diamonds do you offer?
        </h2>
        <p className="text-muted-foreground">
          Select the types of diamonds you want to include in your catalog
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {DIAMOND_TYPES.map((type) => {
          const isSelected = selectedTypes.includes(type.id);
          const Icon = type.id === 'natural' ? Diamond : Sparkles;
          
          return (
            <div
              key={type.id}
              className={`relative flex items-start space-x-4 p-6 rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => toggleType(type.id)}
            >
              <Checkbox
                id={type.id}
                checked={isSelected}
                onCheckedChange={() => toggleType(type.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <Label
                    htmlFor={type.id}
                    className="text-lg font-medium cursor-pointer"
                  >
                    {type.label}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {type.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
