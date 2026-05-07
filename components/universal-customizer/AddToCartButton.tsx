// ======================================================================
// AddToCartButton.ts — 通用版：正規化 group + 中文 summary + 保留 metadata (恢復截圖)
// ======================================================================

import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { toBlob } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { useState } from "react";
import { LoadingOverlay } from "@/components/LoadingOverlay";

// ✔ group → 中文顯示名稱
const GROUP_NAME_MAP: Record<string, string> = {
  color: "顏色",
  flavor: "口味",
  size: "尺寸",
  decorations: "裝飾品",
  decoration: "裝飾品",
  photo_upload: "照片",
  photo: "照片",
  text: "文字內容",
  screenshot: "預覽圖",
  package_screenshot: "包裝預覽圖",
  package_style: "包裝款式",
  box_config: "盒裝配置",
  package_decoration: "包裝裝飾",
  macaron_mode: "馬卡龍模式",
  conditional_fee: "條件費用",
  user_design: "包裝/刊頭設計",
  luck_text_design: "簽文設計檔案",
};

interface ConditionalFeeDetail {
  option_id: number;
  option_name_zh: string;
  fee: number;
}

// ✔ 正規化 group：color_14 → color
const normalizeGroup = (key: string) => {
  const g = key.toLowerCase();
  if (g.startsWith("color")) return "color";
  if (g.startsWith("flavor")) return "flavor";
  if (g.startsWith("size")) return "size";
  if (g.startsWith("decoration") && !g.includes("package")) return "decoration";
  return g;
};

// 最小 Loading 顯示時間（毫秒）— 僅作短暫回饋，不再強制 2 秒
const MIN_LOADING_DURATION = 600;

/**
 * Tailwind `bg-gradient-to-br` 在 html-to-image（SVG foreignObject）路徑上常畫失敗，
 * 呈現大片黑底或透明洞；截圖前改為與 brand-50 接近的實色。
 */
const CAPTURE_SURFACE_BG = "#fff5f7";

type InlineBackgroundSnapshot = {
  backgroundColor: string;
  backgroundImage: string;
  backgroundColorPriority: string;
  backgroundImagePriority: string;
};

function snapshotInlineBackground(el: HTMLElement): InlineBackgroundSnapshot {
  return {
    backgroundColor: el.style.backgroundColor,
    backgroundImage: el.style.backgroundImage,
    backgroundColorPriority: el.style.getPropertyPriority("background-color"),
    backgroundImagePriority: el.style.getPropertyPriority("background-image"),
  };
}

function applySolidCaptureBackground(el: HTMLElement, solid: string) {
  el.style.setProperty("background-image", "none", "important");
  el.style.setProperty("background-color", solid, "important");
}

function restoreInlineBackground(el: HTMLElement, prev: InlineBackgroundSnapshot) {
  const setOrRemove = (prop: "background-color" | "background-image", value: string, priority: string) => {
    if (value) el.style.setProperty(prop, value, priority || undefined);
    else el.style.removeProperty(prop);
  };
  setOrRemove("background-image", prev.backgroundImage, prev.backgroundImagePriority);
  setOrRemove("background-color", prev.backgroundColor, prev.backgroundColorPriority);
}

/** 網址加 `?captureDebug=1` 或主控台執行 `localStorage.setItem('TJ_CAPTURE_DEBUG','1')` 後重整，加入購物車時會 log 截圖診斷資訊 */
function isCaptureDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem("TJ_CAPTURE_DEBUG") === "1") return true;
    return new URLSearchParams(window.location.search).has("captureDebug");
  } catch {
    return false;
  }
}

function logCaptureDebug(label: string, el: HTMLElement, blob: Blob) {
  const url = URL.createObjectURL(blob);
  console.info(`[capture-debug:${label}]`, {
    offsetWidth: el.offsetWidth,
    offsetHeight: el.offsetHeight,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    blobSize: blob.size,
    blobType: blob.type,
    objectUrl: url,
    hint: "在網址列貼上 objectUrl 可檢視原始截圖；檢查完請 revoke 或關分頁避免記憶體累積",
  });
}

/** 解碼已 complete 的圖片，讓 foreignObject/canvas 截圖時像素已就緒 */
async function decodeImageIfPossible(img: HTMLImageElement): Promise<void> {
  if (!img.complete) return;
  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      /* ignore */
    }
  }
}

/** 等待容器內所有 img：load → decode → 雙 rAF 穩定排版（最多 timeout ms） */
const waitForImages = async (container: HTMLElement, timeout = 2500): Promise<void> => {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.race([
    (async () => {
      await Promise.all(
        images.map(async (img) => {
          if (!img.complete) {
            await new Promise<void>((resolve) => {
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            });
          }
          await decodeImageIfPossible(img);
        }),
      );
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
    })(),
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ]);
};

export function useAddToCart() {
  const { addToCartCustom } = useCart();
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const addToCart = async (
    productId: string,
    productName: string,
    category: string,
    unitPrice: number,
    finalQuantity: number,
    selectedOptions: any,
    uploadedPhotoURL?: string,
    userTextInput?: any,
    previewUrl?: string,
    captureRef?: HTMLDivElement | null,
    optionsMap?: Record<number, any>,
    parentMap?: Record<number, number | null>,
    optionNames?: Map<number, string>,
    onConfirm?: () => Promise<void>,
    skipPackageCustomizer?: boolean, // 禮盒專用：跳過包裝設計器
    packageTotalPrice?: number, // 包裝總價（含盒裝+裝飾品）
    conditionalFeeDetails?: ConditionalFeeDetail[], // 條件費用明細
    backendGrandTotal?: number, // ✅ 後端計算的總價（購物車應信任此值）
    /** 僅包裝小圖區塊：第二次 toBlob 上傳為獨立 customizations 群組 */
    packageCaptureRef?: HTMLDivElement | null,
  ) => {
    // 如果提供了 onConfirm 回調，先執行確認邏輯
    if (onConfirm) {
      await onConfirm();
      return;
    }

    // 開始計時
    const startTime = Date.now();
    setIsLoading(true);

    const collectedGroups: any[] = [];
    let screenshotUrl = previewUrl; // 預設使用傳入的 URL

    try {
      // --------------------------------------------------
      // ① 預覽區截圖上傳 (修正：恢復完整的截圖邏輯)
      // --------------------------------------------------
      if (captureRef) {
        // ✅ 先檢查 captureRef 是否有有效尺寸
        if (captureRef.offsetWidth === 0 || captureRef.offsetHeight === 0) {
          console.warn("截圖目標尺寸為 0，跳過截圖，使用 fallback:", {
            offsetWidth: captureRef.offsetWidth,
            offsetHeight: captureRef.offsetHeight,
          });
        } else {
          const originalTransform = captureRef.style.transform;
          const originalTransformOrigin = captureRef.style.transformOrigin;
          const computedT = typeof window !== "undefined" ? getComputedStyle(captureRef).transform : "none";
          const hadInlineOrComputedTransform =
            originalTransform !== "" || (computedT !== "none" && computedT !== "");

          const bgSnap = snapshotInlineBackground(captureRef);
          applySolidCaptureBackground(captureRef, CAPTURE_SURFACE_BG);

          if (hadInlineOrComputedTransform) {
            captureRef.style.transform = "none";
            captureRef.style.transformOrigin = "";
          }

          try {
            // ✅ 等待所有圖片載入完成
            await waitForImages(captureRef);

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

            const excludeFromMainCapture = (node: unknown) => {
              if (!(node instanceof HTMLElement)) return true;
              return !node.closest("[data-capture-exclude]");
            };

            const captureOptions = {
              quality: 0.9,
              /** 高 pixelRatio + 大節點在部分瀏覽器會光柵化異常（黑畫面）；縮圖以穩定為先 */
              pixelRatio: 1,
              skipFonts: true,
              cacheBust: false,
              backgroundColor: CAPTURE_SURFACE_BG,
              filter: excludeFromMainCapture,
            };

            // ✅ 使用 toBlob 取代 toPng，避免 iOS 大 data URL 問題
            let blob = await toBlob(captureRef, captureOptions);

            // ✅ 首次光栅化不完整時（常見於隱藏預覽樹），短暫等待後重試
            if (!blob) {
              console.warn("截圖 blob 為空，320ms 後重試…");
              await new Promise((r) => setTimeout(r, 320));
              await waitForImages(captureRef, 1200);
              blob = await toBlob(captureRef, captureOptions);
            }
            if (!blob && isIOS) {
              console.warn("iOS 二次截圖失敗，300ms 後再試…");
              await new Promise((r) => setTimeout(r, 300));
              blob = await toBlob(captureRef, captureOptions);
            }

            if (!blob) throw new Error("截圖生成失敗（blob 為空）");

            if (isCaptureDebugEnabled()) {
              logCaptureDebug("main", captureRef, blob);
            }

            const webpBlob = await prepareImageForUpload(new File([blob], "screenshot.png", { type: "image/png" }));
            const fileName = `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webp`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("customizer_uploads")
              .upload(fileName, webpBlob, { contentType: "image/webp" });

            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage.from("customizer_uploads").getPublicUrl(uploadData.path);
              screenshotUrl = urlData.publicUrl;

              collectedGroups.push({
                group: "screenshot",
                group_name_zh: GROUP_NAME_MAP["screenshot"],
                items: [{ url: screenshotUrl }],
              });
            } else if (uploadError) {
              console.error("截圖上傳到 Supabase 失敗:", uploadError);
            }
          } catch (err) {
            console.error("截圖生成失敗:", err, {
              captureRefExists: !!captureRef,
              captureRefDimensions: {
                width: captureRef.offsetWidth,
                height: captureRef.offsetHeight,
              },
            });
          } finally {
            if (hadInlineOrComputedTransform) {
              captureRef.style.transform = originalTransform;
              captureRef.style.transformOrigin = originalTransformOrigin;
            }
            restoreInlineBackground(captureRef, bgSnap);
          }
        }
      }

      // ①b 包裝小圖：獨立截圖上傳（與主預覽圖分開欄位）
      if (
        packageCaptureRef &&
        packageCaptureRef.offsetWidth > 0 &&
        packageCaptureRef.offsetHeight > 0
      ) {
        const pkgBgSnap = snapshotInlineBackground(packageCaptureRef);
        applySolidCaptureBackground(packageCaptureRef, CAPTURE_SURFACE_BG);
        try {
          await waitForImages(packageCaptureRef);
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const pkgOptions = {
            quality: 0.9,
            pixelRatio: 1,
            skipFonts: true,
            cacheBust: false,
            backgroundColor: CAPTURE_SURFACE_BG,
          };
          let pkgBlob = await toBlob(packageCaptureRef, pkgOptions);
          if (!pkgBlob) {
            await new Promise((r) => setTimeout(r, 320));
            await waitForImages(packageCaptureRef, 1200);
            pkgBlob = await toBlob(packageCaptureRef, pkgOptions);
          }
          if (!pkgBlob && isIOS) {
            await new Promise((r) => setTimeout(r, 300));
            pkgBlob = await toBlob(packageCaptureRef, pkgOptions);
          }
          if (pkgBlob) {
            if (isCaptureDebugEnabled()) {
              logCaptureDebug("package", packageCaptureRef, pkgBlob);
            }
            const webpPkg = await prepareImageForUpload(new File([pkgBlob], "package-screenshot.png", { type: "image/png" }));
            const pkgFileName = `package-preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webp`;
            const { data: pkgUpload, error: pkgErr } = await supabase.storage
              .from("customizer_uploads")
              .upload(pkgFileName, webpPkg, { contentType: "image/webp" });
            if (!pkgErr && pkgUpload) {
              const { data: pkgUrl } = supabase.storage.from("customizer_uploads").getPublicUrl(pkgUpload.path);
              collectedGroups.push({
                group: "package_screenshot",
                group_name_zh: GROUP_NAME_MAP["package_screenshot"],
                items: [{ url: pkgUrl.publicUrl }],
              });
            } else if (pkgErr) {
              console.error("包裝預覽截圖上傳失敗:", pkgErr);
            }
          }
        } catch (pkgCaptureErr) {
          console.error("包裝預覽截圖失敗:", pkgCaptureErr);
        } finally {
          restoreInlineBackground(packageCaptureRef, pkgBgSnap);
        }
      }

      // --------------------------------------------------
      // ② 整理 color/flavor/size/decoration
      // --------------------------------------------------
      Object.entries(selectedOptions).forEach(([groupKey, value]) => {
        if (!value) return;

        const group = normalizeGroup(groupKey);

        let groupZh = GROUP_NAME_MAP[group] || group;

        // ✅ 對於 color/flavor/size，向上查找 root id 的 option_name_zh
        if ((group === "color" || group === "flavor" || group === "size") && !Array.isArray(value)) {
          const rootIdMatch = groupKey.match(/_(\d+)$/);
          const rootId = rootIdMatch ? parseInt(rootIdMatch[1]) : null;

          if (rootId && optionNames && optionNames.get(rootId)) {
            groupZh = optionNames.get(rootId)!;
          }
        }

        // --------------------------------------------------
        // 處理顏色/口味/尺寸 (單選)
        // --------------------------------------------------
        if ((group === "color" || group === "flavor" || group === "size") && !Array.isArray(value)) {
          const val = value as any;
          collectedGroups.push({
            group,
            group_name_zh: groupZh,
            items: [
              {
                option_id: val.option_id,
                option_name: val.option_name_zh,
                metadata: val.metadata_product,
              },
            ],
          });
        }

        // --------------------------------------------------
        // 處理裝飾品 (多選 - 葉子節點)
        // --------------------------------------------------
        if (group === "decoration" && optionsMap && parentMap) {
          // 修復後的 buildPath 邏輯
          const buildPath = (optionId: number): string => {
            let currentId: number | null = optionId;
            const pathSegments: string[] = [];

            // 這裡假設 optionsMap 包含所有裝飾品的節點
            while (currentId !== null) {
              const option = optionsMap[currentId];
              if (!option) break;

              pathSegments.push(option.option_name_zh);

              const parentId: number | null = parentMap[currentId] ?? null;
              // 停止條件：到達根節點 (parentMap[currentId] 為 null)
              if (!parentId || !parentMap[parentId]) break;

              currentId = parentId;
            }

            // 路徑是從葉子節點到根節點，反轉後用 ' - ' 連接
            return pathSegments.reverse().join(" - ");
          };

          collectedGroups.push({
            group,
            group_name_zh: groupZh,
            items: (value as any[]).map((opt) => ({
              option_id: opt.option_id,
              option_name: buildPath(opt.option_id),
              metadata: opt.metadata_product,
            })),
          });
        }

        // --------------------------------------------------
        // 處理包裝款式
        // --------------------------------------------------
        if (groupKey === "package_style" && value) {
          const val = value as any;
          collectedGroups.push({
            group: "package_style",
            group_name_zh: GROUP_NAME_MAP["package_style"],
            items: [
              {
                option_id: val.option_id,
                option_name: val.option_name_zh,
                price_modifier: val.price_modifier,
              },
            ],
            details: {
              totalPrice: val.boxTotalPrice || 0, // 盒裝總價
            },
          });
        }

        // --------------------------------------------------
        // 處理盒裝配置
        // --------------------------------------------------
        if (groupKey === "box_config" && value) {
          const val = value as any;
          collectedGroups.push({
            group: "box_config",
            group_name_zh: GROUP_NAME_MAP["box_config"],
            items: [val], // 直接存 {config1, config2}
          });
        }

        // --------------------------------------------------
        // 處理包裝裝飾品
        // --------------------------------------------------
        if (groupKey === "package_decoration" && Array.isArray(value)) {
          const decorations = value as any[];
          const decorationTotalPrice = decorations.reduce((sum, opt) => sum + (opt.totalPrice || 0), 0);
          collectedGroups.push({
            group: "package_decoration",
            group_name_zh: GROUP_NAME_MAP["package_decoration"],
            items: decorations.map((opt) => ({
              option_id: opt.option_id,
              option_name: opt.option_name_zh,
              price_modifier: opt.price_modifier,
            })),
            details: {
              totalPrice: decorationTotalPrice,
            },
          });
        }

        // --------------------------------------------------
        // 處理馬卡龍模式
        // --------------------------------------------------
        if (groupKey === "macaron_mode" && value) {
          collectedGroups.push({
            group: "macaron_mode",
            group_name_zh: GROUP_NAME_MAP["macaron_mode"],
            items: [value],
          });
        }

        // --------------------------------------------------
        // 處理用戶設計連結（luck/popcorn 專用）
        // --------------------------------------------------
        if (groupKey === "user_design" && value) {
          const val = value as any;
          collectedGroups.push({
            group: "user_design",
            group_name_zh: val.label || GROUP_NAME_MAP["user_design"],
            items: [{ url: val.url, label: val.label }],
          });
        }

        // --------------------------------------------------
        // 處理客製化貼紙/插卡照片連結（7226/7229）
        // --------------------------------------------------
        if (groupKey === "package_decoration_uploads" && Array.isArray(value)) {
          value.forEach((upload: any) => {
            collectedGroups.push({
              group: "package_decoration_upload",
              group_name_zh: upload.label || "客製化照片連結",
              items: [{ url: upload.url, option_id: upload.option_id }],
            });
          });
        }
      });

      // --------------------------------------------------
      // ③ 照片上傳
      // --------------------------------------------------
      if (uploadedPhotoURL) {
        collectedGroups.push({
          group: "photo",
          group_name_zh: GROUP_NAME_MAP["photo"],
          items: [{ url: uploadedPhotoURL }],
        });
      }

      // --------------------------------------------------
      // ④ 文字輸入檔案處理
      // --------------------------------------------------
      if (userTextInput) {
        // ✅ 支援 LuckTextPayload 格式（mode: "text" | "design" | "random"）
        if (typeof userTextInput === "object" && userTextInput.mode) {
          if (userTextInput.mode === "text" && userTextInput.csvUrl) {
            // 純文字模式 - 使用已上傳的 CSV URL
            collectedGroups.push({
              group: "text",
              group_name_zh: GROUP_NAME_MAP["text"],
              summary: "簽文內容檔案",
              items: [{ url: userTextInput.csvUrl }],
            });
          } else if (userTextInput.mode === "design" && userTextInput.designLink) {
            // 自行設計模式 - 使用用戶提供的雲端連結
            collectedGroups.push({
              group: "luck_text_design",
              group_name_zh: "簽文設計檔案",
              summary: "自行設計簽文",
              items: [{ url: userTextInput.designLink }],
            });
          } else if (userTextInput.mode === "random") {
            // ✅ 隨機正向小語模式 - 純文字，無 URL
            collectedGroups.push({
              group: "luck_text_design",
              group_name_zh: "簽文設計檔案",
              summary: "隨機正向小語",
              items: [{ message: "隨機正向小語" }],
            });
          }
        }
        // ✅ 如果 userTextInput 已經是 URL（由 TextInputTable 上傳），直接使用
        else if (typeof userTextInput === "string" && userTextInput.startsWith("http")) {
          collectedGroups.push({
            group: "text",
            group_name_zh: GROUP_NAME_MAP["text"],
            items: [{ url: userTextInput }],
          });
        } else if (Array.isArray(userTextInput)) {
          // 如果是陣列，才需要上傳
          try {
            const BOM = "\uFEFF";
            const csvContent =
              "text,quantity\n" + userTextInput.map((row) => `"${row.text}",${row.quantity}`).join("\n");
            const csvBlob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
            const fileName = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.csv`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("customizer_uploads")
              .upload(fileName, csvBlob, { contentType: "text/csv;charset=utf-8" });

            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage.from("customizer_uploads").getPublicUrl(uploadData.path);
              collectedGroups.push({
                group: "text",
                group_name_zh: GROUP_NAME_MAP["text"],
                items: [{ url: urlData.publicUrl }],
              });
            }
          } catch (err) {
            console.error("文字檔案上傳失敗:", err);
          }
        }
      }

      // --------------------------------------------------
      // ④.1 條件費用明細處理
      // --------------------------------------------------
      if (conditionalFeeDetails && conditionalFeeDetails.length > 0) {
        conditionalFeeDetails.forEach((feeDetail: { option_id?: number; option_name_zh?: string; fee?: number; label?: string; amount?: number }) => {
          const fee = feeDetail.fee ?? feeDetail.amount ?? 0;
          const label = feeDetail.option_name_zh ?? feeDetail.label ?? "";
          collectedGroups.push({
            group: "conditional_fee",
            group_name_zh: "條件費用",
            summary: `「${label}」費用 NT$${fee.toLocaleString()}`,
            details: {
              option_id: feeDetail.option_id,
              option_name_zh: label,
              fee,
            },
          });
        });
      }

      // --------------------------------------------------
      // ⑤ 生成 summary（購物車顯示）
      // --------------------------------------------------
      const readableSummary = collectedGroups.map((c) => {
        // 特殊處理盒裝配置
        if (c.group === "box_config") {
          const config = c.items[0];
          const parts: string[] = [];
          if (config.config1) {
            parts.push(`規格一：${config.config1.capacity}/${config.config1.color}/${config.config1.quantity}盒`);
          }
          if (config.config2) {
            parts.push(`規格二：${config.config2.capacity}/${config.config2.color}/${config.config2.quantity}盒`);
          }
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: parts.join("、") || "未配置",
            details: config, // 保留完整的 config 物件供 cart 顯示
          };
        }

        // 特殊處理馬卡龍模式
        if (c.group === "macaron_mode") {
          const mode = c.items[0];
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: mode.description || mode.mode,
            details: mode,
          };
        }

        // 特殊處理包裝款式（保留 totalPrice）
        if (c.group === "package_style") {
          const summaryText = c.items.map((i: any) => i.option_name).join("、");
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: summaryText,
            details: c.details || {},
          };
        }

        // 特殊處理包裝裝飾品（保留 totalPrice）
        if (c.group === "package_decoration") {
          const summaryText = c.items.map((i: any) => i.option_name).join("、");
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: summaryText,
            details: c.details || {},
          };
        }

        // ✅ 特殊處理用戶設計連結（顯示為可點擊連結）
        if (c.group === "user_design") {
          const item = c.items[0];
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: item.label || "包裝/刊頭設計",
            value: { url: item.url, label: item.label },
          };
        }

        // ✅ 特殊處理客製化貼紙/插卡照片連結（顯示為可點擊連結）
        if (c.group === "package_decoration_upload") {
          const item = c.items[0];
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: c.group_name_zh,
            value: { url: item.url },
          };
        }

        // ✅ 已處理的特殊群組（conditional_fee）直接跳過，它沒有 items 屬性
        if (c.group === "conditional_fee") {
          return {
            group: c.group,
            group_name_zh: c.group_name_zh,
            summary: c.summary,
            details: c.details,
          };
        }

        const summaryText = c.items
          .map((i: any) => {
            if (i.option_name) return i.option_name;
            // 針對 URL，給予更具體的 summary 文本
            if (c.group === "screenshot") return "已生成預覽圖";
            if (c.group === "package_screenshot") return "已生成包裝預覽圖";
            if (c.group === "photo") return "已上傳照片";
            if (c.group === "text") return "已上傳文字檔案";

            if (i.url) return "已上傳檔案";
            if (i.message) return i.message;
            return "資料";
          })
          .join("、");

        return {
          group: c.group,
          group_name_zh: c.group_name_zh,
          summary: summaryText,
          // 只有照片和文字檔案 URL 是單獨存為 { url: ... } 物件
          // ✅ 新增 luck_text_design 到連結群組列表
          value:
            (c.group === "photo" ||
              c.group === "text" ||
              c.group === "screenshot" ||
              c.group === "package_screenshot" ||
              c.group === "user_design" ||
              c.group === "package_decoration_upload" ||
              c.group === "luck_text_design") &&
            c.items.length === 1 &&
            c.items[0].url
              ? { url: c.items[0].url }
              : c.items,
        };
      });

      // --------------------------------------------------
      // ⑥ 計算 total_price 並寫入 CartContext
      // ✅ 優先使用後端計算的 grand_total，確保價格安全
      // --------------------------------------------------
      const totalPrice = backendGrandTotal ?? unitPrice * finalQuantity + (packageTotalPrice || 0);

      // 生成臨時 ID 用於關聯甜點與包裝
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      addToCartCustom({
        product_id: productId,
        name: productName,
        category,
        quantity: finalQuantity,
        price: unitPrice,
        total_price: totalPrice,
        preview_url: screenshotUrl,
        temp_id: tempId, // 用於關聯包裝設計
        customizations: readableSummary,
      });

      // 僅確保最短 Loading 回饋（約 0.6 秒），不再強制 2 秒

      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_DURATION) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DURATION - elapsed));
      }

      toast({
        title: "✅ 已加入購物車",
        description: "您的設計已存入購物車",
      });

      // ✅ 禮盒專用：直接導航到購物車，不進包裝設計器
      if (skipPackageCustomizer) {
        router.push("/cart");
      } else {
        // 導航到包裝設計器
        router.push(`/package-customizer/${productId}?dessertQuantity=${finalQuantity}&tempId=${tempId}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 返回 Loading 狀態和元件
  const LoadingComponent = () => <LoadingOverlay isVisible={isLoading} message="正在加入購物車..." />;

  return { addToCart, isLoading, LoadingComponent };
}
