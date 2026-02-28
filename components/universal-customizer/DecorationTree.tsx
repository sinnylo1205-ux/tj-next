// ======================================================================
// DecorationTree.tsx — 通用樹狀裝飾選擇器（基於 Customizer.tsx）
// ======================================================================

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DecorationOption } from "@/hooks/useHierarchicalOptions";

interface DecorationTreeProps {
  title?: string;
  options: DecorationOption[];
  selectedDecorations: Set<number>;
  openPath: number[];
  optionsMap: Record<number, DecorationOption>;
  childrenMap: Record<number, number[]>;
  onToggle: (option: DecorationOption) => void;
  onSelect: (option: DecorationOption) => void;
  isInBranch: (id: number, root: number) => boolean;
  onPhotoUpload?: (optionId: number, file: File) => Promise<void>;
  onPhotoClear?: (optionId: number) => Promise<void>;
  uploadedPhotos?: Set<number>;
}

export function DecorationTree({
  title,
  options,
  selectedDecorations,
  openPath,
  optionsMap,
  childrenMap,
  onToggle,
  onSelect,
  isInBranch,
  onPhotoUpload,
  onPhotoClear,
  uploadedPhotos = new Set(),
}: DecorationTreeProps) {
  const isMobile = useIsMobile();
  // 照片上傳 loading 狀態
  const [isUploading, setIsUploading] = useState(false);

  // 用於追蹤需要滾動到的元素
  const scrollTargetRef = useRef<HTMLDivElement | null>(null);
  // 當 openPath 變化時，滾動到最後一個展開的選項
  useEffect(() => {
    if (openPath.length > 0 && scrollTargetRef.current) {
      // 延遲滾動，等待 DOM 更新
      setTimeout(() => {
        scrollTargetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [openPath]);

  // 取得 openPath 中的最後一個 ID（需要滾動到的目標）
  const scrollTargetId = openPath.length > 0 ? openPath[openPath.length - 1] : null;

  // 找出根選項（包含 parent_id 為 null 或等於傳入的第一個 option 的 parent_id）
  const rootOptions = options
    .filter((opt) => {
      // 如果沒有 parent_id，是根選項
      if (!opt.parent_id) return true;
      // 如果 parent_id 不在 optionsMap 中，也視為根選項
      if (!optionsMap[opt.parent_id]) return true;
      return false;
    })
    .sort((a, b) => (a.sort_order ?? a.option_id) - (b.sort_order ?? b.option_id));

  // 層級顏色配置 - 使用 brand primary 漸層增加辨識度
  const levelColors = [
    "", // level 0: 根層級，無背景
    "bg-primary/5", // level 1: 非常淡
    "bg-primary/10", // level 2: 稍淡
    "bg-primary/15", // level 3: 中等
    "bg-primary/20", // level 4+: 較深
  ];

  // 遞迴渲染選項
  const renderOption = (option: DecorationOption, level: number = 0): React.ReactElement | null => {
    const isSelected = selectedDecorations.has(option.option_id);
    const isExpanded = openPath.includes(option.option_id);
    const children = (childrenMap[option.option_id] || [])
      .map((id) => optionsMap[id])
      .filter(Boolean)
      .sort((a, b) => (a.sort_order ?? a.option_id) - (b.sort_order ?? b.option_id));
    const hasChildren = children.length > 0;

    // 增加縮排距離，讓層級更明顯
    const paddingLeft = level * 6;
    // 層級背景顏色
    const bgColor = levelColors[Math.min(level, 4)];

    // 判斷是否為裝飾品群組（需要 grid 展示）
    // 包含：甜點裝飾品 (4) 和 包裝裝飾品 (7028)
    const isDecorationGroup =
      option.option_id === 4 ||
      isInBranch(option.option_id, 4) ||
      option.option_id === 7028 ||
      isInBranch(option.option_id, 7028);

    // 判斷是否為照片群組（不需要 grid 展示）
    const isPhotoCarrierGroup =
      option.option_id === 3 ||
      option.parent_id === 3 ||
      option.option_name_zh?.includes("照片") ||
      option.option_name_zh?.includes("載體");

    // 判斷此選項是否為滾動目標
    const isScrollTarget = option.option_id === scrollTargetId;

    return (
      <div
        key={option.option_id}
        ref={isScrollTarget ? scrollTargetRef : undefined}
        className={`
          ${level > 0 ? "border-l-2 border-primary/30 pl-3" : ""}
          ${bgColor}
          ${level > 0 ? "rounded-r-lg" : ""}
        `}
        style={{
          marginLeft: isMobile ? 0 : paddingLeft,
          marginTop: level === 0 ? 0 : 8,
          paddingTop: level > 0 ? 6 : 0,
          paddingBottom: level > 0 ? 6 : 0,
          paddingRight: level > 0 ? 6 : 0,
        }}
      >
        {/* 選項本身 */}
        <div
          onClick={() => (option.is_final_option ? onSelect(option) : onToggle(option))}
          className={`
            w-full text-left flex justify-between items-center
            border rounded-xl 
            px-4 py-3 mb-2
            transition-colors cursor-pointer
            ${
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white border-gray-300 hover:bg-primary/10 hover:border-primary/50"
            }
          `}
        >
          <div className="flex items-center flex-1">
            {hasChildren && !option.is_final_option && (
              <span className="mr-2">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
            )}
            <span className="flex-1">{option.option_name_zh}</span>
          </div>
          {option.price_modifier !== 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {option.price_modifier > 0 ? "+" : ""}NT$ {option.price_modifier}
            </span>
          )}
        </div>

        {/* 照片上傳按鈕 */}
        {option.is_final_option && isSelected && option.metadata_product?.requires_photo_upload && onPhotoUpload && (
          <div className="mb-4 space-y-2 ml-4">
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setIsUploading(true);
                  try {
                    await onPhotoUpload(option.option_id, file);
                  } finally {
                    setIsUploading(false);
                  }
                }
              }}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            <p className="text-xs text-muted-foreground">請上傳 PNG 或 JPG 格式照片，大小不超過 2MB</p>
            {uploadedPhotos.has(option.option_id) && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-green-600">✓ 照片已上傳</p>
                {onPhotoClear && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPhotoClear(option.option_id);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" /> 清除照片
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 裝飾品選項縮圖預覽 */}
        {option.is_final_option && isSelected && option.item_image_url && !isPhotoCarrierGroup && (
          <div className="mt-2 mb-4 ml-4">
            <img
              src={option.thumbnail_url || option.item_image_url}
              alt={option.option_name_zh}
              width={80}
              height={80}
              className="w-20 h-20 object-contain border rounded"
            />
          </div>
        )}

        {/* 子選項渲染 */}
        {hasChildren &&
          isExpanded &&
          (() => {
            const allChildrenAreFinal = children.every((c) => c.is_final_option);

            // 1️⃣ 裝飾品 final options → grid
            if (allChildrenAreFinal && isDecorationGroup) {
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 justify-items-center mt-4 mb-4 bg-primary/5 p-4 rounded-xl border border-primary/10">
                  {children.map((child) => {
                    const isChildSelected = selectedDecorations.has(child.option_id);
                    const needsUpload = child.metadata_product?.requires_photo_upload ?? false;
                    return (
                      <div key={child.option_id} className="space-y-2 w-full text-center">
                        <button
                          onClick={() => onSelect(child)}
                          className={`flex flex-col items-center justify-center rounded-xl border-2 transition-all text-center w-28 h-28 sm:w-32 sm:h-32 mx-auto ${
                            isChildSelected
                              ? "border-primary bg-primary/10 scale-105 shadow-md"
                              : "border-border bg-white hover:border-primary/50 hover:bg-muted/50"
                          }`}
                        >
                          {child.item_image_url && (
                            <img
                              src={child.thumbnail_url || child.item_image_url}
                              alt={child.option_name_zh}
                              width={80}
                              height={80}
                              className="w-14 h-14 sm:w-20 sm:h-20 lg:w-20 lg:h-20 object-contain mb-1 sm:mb-2"
                            />
                          )}
                          <p className="font-medium text-xs sm:text-sm">{child.option_name_zh}</p>
                          {child.price_modifier !== 0 && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground">+NT$ {child.price_modifier}</p>
                          )}
                        </button>

                        {/* ✅ Grid 模式的照片上傳區（7226/7229 等） */}
                        {needsUpload && isChildSelected && onPhotoUpload && (
                          <div className="mt-2 space-y-2 text-left">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setIsUploading(true);
                                  try {
                                    await onPhotoUpload(child.option_id, file);
                                  } finally {
                                    setIsUploading(false);
                                  }
                                }
                              }}
                              className="block w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                            />
                            <p className="text-xs text-muted-foreground">PNG/JPG，≤2MB</p>
                            {uploadedPhotos.has(child.option_id) && (
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-green-600">✓ 已上傳</p>
                                {onPhotoClear && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onPhotoClear(child.option_id);
                                    }}
                                  >
                                    <X className="h-3 w-3" /> 清除
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            // 2️⃣ 照片載體 final options → 垂直列表 + 上傳按鈕
            if (allChildrenAreFinal && isPhotoCarrierGroup) {
              return (
                <div className="space-y-3 mt-3 mb-4">
                  {children.map((child) => {
                    const isChildSelected = selectedDecorations.has(child.option_id);
                    const needsUpload = child.metadata_product?.requires_photo_upload ?? false;

                    return (
                      <div key={child.option_id} className="space-y-2">
                        <Button
                          variant={isChildSelected ? "default" : "outline"}
                          onClick={() => onSelect(child)}
                          className="w-full justify-start text-left"
                        >
                          {child.option_name_zh}
                          {child.price_modifier !== 0 && (
                            <span className="ml-2 text-xs">+NT$ {child.price_modifier}</span>
                          )}
                        </Button>

                        {needsUpload && isChildSelected && onPhotoUpload && (
                          <div className="ml-4 space-y-2">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setIsUploading(true);
                                  try {
                                    await onPhotoUpload(child.option_id, file);
                                  } finally {
                                    setIsUploading(false);
                                  }
                                }
                              }}
                              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                            />
                            <p className="text-xs text-muted-foreground">請上傳 PNG 或 JPG 格式照片，大小不超過 1MB</p>
                            {uploadedPhotos.has(child.option_id) && (
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-green-600">✓ 照片已上傳</p>
                                {onPhotoClear && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onPhotoClear(child.option_id);
                                    }}
                                  >
                                    <X className="h-3 w-3 mr-1" /> 清除照片
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            // 3️⃣ 非 final options → 遞迴渲染
            return <div className="space-y-2 mt-3">{children.map((child) => renderOption(child, level + 1))}</div>;
          })()}
      </div>
    );
  };

  return (
    <div className="space-y-4 relative">
      <LoadingOverlay isVisible={isUploading} message="照片上傳中..." />
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <div className="space-y-1">{rootOptions.map((option) => renderOption(option, 0))}</div>
    </div>
  );
}
