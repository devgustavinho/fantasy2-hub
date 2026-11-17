import { ArrowUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TOPIC_SORTS, type TopicSort } from "@/lib/topicSort";

type TopicSortControlProps = {
  value: TopicSort;
  onChange: (value: TopicSort) => void;
};

export function TopicSortControl({ value, onChange }: TopicSortControlProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="topic-sort" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ArrowUpDown className="h-3.5 w-3.5" />
        Ordenar por
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as TopicSort)}>
        <SelectTrigger id="topic-sort" className="w-full sm:max-w-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TOPIC_SORTS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
