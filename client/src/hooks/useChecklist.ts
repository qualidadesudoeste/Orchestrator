import { useState, useEffect, useCallback } from "react";
import { phases, totalItems } from "@/data/qaData";

const STORAGE_KEY = "qa-checklist-state";

export function useChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked]);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const reset = useCallback(() => {
    setChecked({});
  }, []);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const globalProgress = Math.round((checkedCount / totalItems) * 100);

  const phaseProgress = phases.map((phase) => {
    const phaseItems = phase.steps.flatMap((s) => s.items);
    const phaseChecked = phaseItems.filter((item) => checked[item.id]).length;
    return {
      phaseId: phase.id,
      total: phaseItems.length,
      checked: phaseChecked,
      percent: Math.round((phaseChecked / phaseItems.length) * 100),
    };
  });

  return { checked, toggle, reset, globalProgress, checkedCount, phaseProgress };
}
