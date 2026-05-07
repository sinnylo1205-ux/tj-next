"use client";

import { useRouter } from "next/navigation";
import { GiftBoxesClient } from "./GiftBoxesClient";

export function GiftBoxesRouter() {
  const router = useRouter();
  return <GiftBoxesClient navigate={(url) => router.push(url)} />;
}
