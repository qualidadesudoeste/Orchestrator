import { cn } from "@/lib/utils";
import type { CheckItem } from "@/data/qaData";
import { ExternalLink } from "lucide-react";

interface ChecklistItemProps {
  item: CheckItem;
  checked: boolean;
  onToggle: (id: string) => void;
  phaseColor: string;
}

const tagColors: Record<string, { bg: string; text: string }> = {
  "IA": { bg: "#EDE9FE", text: "#6D28D9" },
  "Ferramenta": { bg: "#DBEAFE", text: "#1D4ED8" },
  "Automação": { bg: "#ECFDF5", text: "#065F46" },
  "Manual": { bg: "#FEF3C7", text: "#92400E" },
  "Urgente": { bg: "#FEE2E2", text: "#991B1B" },
  "Criticidade": { bg: "#FEE2E2", text: "#991B1B" },
  "Novo Projeto": { bg: "#F0FDF4", text: "#166534" },
  "Métricas": { bg: "#FFF7ED", text: "#9A3412" },
};

export function ChecklistItem({ item, checked, onToggle, phaseColor }: ChecklistItemProps) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-3.5 border transition-all duration-200 cursor-pointer",
        checked
          ? "opacity-60"
          : "hover:shadow-md"
      )}
      style={{
        background: checked ? "#F9FAFB" : "white",
        borderColor: checked ? "#D1D5DB" : "#E5E7EB",
        borderLeft: checked ? `3px solid #D1D5DB` : `3px solid ${phaseColor}`,
      }}
      onClick={() => onToggle(item.id)}
    >
      {/* Custom checkbox */}
      <div
        className="mt-0.5 w-5 h-5 rounded shrink-0 border-2 flex items-center justify-center transition-all duration-200"
        style={{
          borderColor: checked ? phaseColor : "#D1D5DB",
          background: checked ? phaseColor : "transparent",
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn("text-sm leading-snug font-medium transition-all duration-200", checked && "line-through text-gray-400")}
          style={{ color: checked ? undefined : "#1A1A1A" }}
        >
          {item.text}
        </p>

        {item.detail && !checked && (
          <p className="text-xs mt-1 text-gray-500 leading-relaxed">{item.detail}</p>
        )}

      {item.code && !checked && (
          <code
            className="block mt-2 text-xs px-3 py-2 font-mono"
            style={{ background: "#1A1A2E", color: "#7DD3FC" }}
          >
            {item.code}
          </code>
        )}

        {item.link && !checked && (
          <a
            href={item.link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium hover:underline transition-colors"
            style={{ color: phaseColor }}
          >
            <ExternalLink size={11} />
            {item.link.label}
          </a>
        )}

        {item.tags && item.tags.length > 0 && !checked && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.tags.map((tag) => {
              const colors = tagColors[tag] || { bg: "#F3F4F6", text: "#374151" };
              return (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
