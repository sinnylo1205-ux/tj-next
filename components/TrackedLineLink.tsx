"use client";

import type { ComponentProps } from "react";
import { trackLineClick, type LineClickPosition } from "@/lib/track-line-click";

type TrackedLineLinkProps = ComponentProps<"a"> & {
  position: LineClickPosition | string;
};

/** 帶 GA4 line_click 追蹤的外部 LINE 連結 */
export function TrackedLineLink({ position, onClick, ...props }: TrackedLineLinkProps) {
  return (
    <a
      {...props}
      onClick={(e) => {
        trackLineClick(position);
        onClick?.(e);
      }}
    />
  );
}
