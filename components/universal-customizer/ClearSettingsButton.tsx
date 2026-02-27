// ======================================================================
// ClearSettingsButton.tsx — 清除設定按鈕（Card 右上角）
// ======================================================================

import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface ClearSettingsButtonProps {
  onClick: () => void;
  label?: string;
}

export function ClearSettingsButton({ onClick, label = "清除設定" }: ClearSettingsButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute -top-0 right-3 z-10 text-muted-foreground hover:text-destructive text-xs h-auto py-1 px-2"
    >
      <RotateCcw size={12} className="mr-1" />
      {label}
    </Button>
  );
}
