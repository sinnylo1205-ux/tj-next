// ======================================================================
// useTextInputRenderer.ts — 動態載入文字輸入組件
// ======================================================================

import { lazy, ComponentType } from "react";
import type { BaseTextInputProps } from "@/components/text-input/TextInputInterface";

// 組件映射表（產品 ID → 組件路徑）
const TEXT_INPUT_COMPONENTS: Record<string, () => Promise<{ default: ComponentType<BaseTextInputProps> }>> = {
  cupcake_choco: () => import("@/components/TextInputTable").then(m => ({ default: m.TextInputTable as any })),
  luck: () => import("@/components/LuckTextInputTable").then(m => ({ default: m.default as any }))
};

export function useTextInputRenderer(productId: string) {
  // 動態載入對應的組件
  const loadComponent = () => {
    const loader = TEXT_INPUT_COMPONENTS[productId];
    
    if (!loader) {
      console.warn(`⚠️ No text input component found for product: ${productId}`);
      return null;
    }

    return lazy(loader);
  };

  return {
    TextInputComponent: loadComponent(),
    hasTextInput: productId in TEXT_INPUT_COMPONENTS
  };
}

export function getTextInputComponentName(productId: string): string | null {
  const componentMap: Record<string, string> = {
    cupcake_choco: "CupcakeChocoTextInput",
    luck: "LuckTextInput"
  };

  return componentMap[productId] || null;
}
