import type { CSSProperties } from "react";

export type PhotoCarrierType =
  | "diamond"
  | "irregular"
  | "circle"
  | "square"
  | "ellipse"
  | "flag"
  | "none";

export const PHOTO_FRAME_CLIP_STYLES: Record<string, CSSProperties> = {
  diamond: { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" },
  irregular: {
    clipPath:
      "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
  },
  circle: { clipPath: "circle(50%)" },
  square: {},
  ellipse: {},
  flag: {},
  none: {},
};

/** circle／square 用 overflow + 圓角；ellipse 用 border-radius 50% 真橢圓；diamond／irregular 用 clip-path */
export function photoFrameOuterClipStyle(
  frameType: string,
  frameStyles: Record<string, CSSProperties> = PHOTO_FRAME_CLIP_STYLES,
): CSSProperties {
  if (frameType === "diamond" || frameType === "irregular") {
    const clipPath = frameStyles[frameType]?.clipPath;
    return clipPath ? { clipPath } : {};
  }
  return {};
}

/**
 * ellipse 用 border-radius: 50%（依寬高比形成平滑橢圓）。
 * 不用 rounded-full（9999px），寬矩形上會變成膠囊形＝兩端半圓＋直邊，轉折明顯。
 */
export function photoFrameShapeStyle(frameType: string): CSSProperties {
  if (frameType === "ellipse") {
    return { borderRadius: "50%" };
  }
  return {};
}

/**
 * 照片載體陰影：務必加在「裁切層的外層」父元素上。
 * 與 clip-path／overflow-hidden 同一層時陰影會被裁掉看不見。
 */
export function photoFrameShadowStyle(frameType: string): CSSProperties {
  if (!frameType || frameType === "none") return {};
  return {
    // 稍明顯一點，在粉紅奶油上仍能看出層次
    filter: "drop-shadow(0 3px 5px rgba(30, 15, 25, 0.32)) drop-shadow(0 1px 2px rgba(30, 15, 25, 0.18))",
  };
}

/** @deprecated 請改用 photoFrameShapeStyle（保留以免舊 bundle 引用報錯） */
export function photoFrameFlatLayStyle(frameType: string): CSSProperties {
  return photoFrameShapeStyle(frameType);
}

export function photoFrameRoundedClass(frameType: string): string {
  if (frameType === "circle") return "rounded-full";
  if (frameType === "square") return "rounded-sm";
  return "";
}

/** 需要裁切的容器 class（ellipse 形狀由 photoFrameShapeStyle 負責）。diamond／irregular 僅靠 clip-path，勿 overflow-hidden 以免吃掉外層陰影。 */
export function photoFrameClipContainerClass(frameType: string): string {
  const rounded = photoFrameRoundedClass(frameType);
  if (frameType === "circle" || frameType === "ellipse" || frameType === "square") {
    return `overflow-hidden ${rounded}`.trim();
  }
  if (frameType === "diamond" || frameType === "irregular") {
    return "";
  }
  if (frameType === "flag") {
    return "overflow-hidden rounded-sm";
  }
  return "";
}

export function isPhotoCarrierType(value: string | undefined): value is PhotoCarrierType {
  return (
    value === "diamond" ||
    value === "irregular" ||
    value === "circle" ||
    value === "square" ||
    value === "ellipse" ||
    value === "flag" ||
    value === "none"
  );
}
