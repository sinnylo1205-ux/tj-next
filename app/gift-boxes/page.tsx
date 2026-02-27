"use client";

import { useRouter } from "next/navigation";
import { GiftBoxesClient } from "./GiftBoxesClient";

export default function GiftBoxesPage() {
  const router = useRouter();
  return <GiftBoxesClient navigate={(url) => router.push(url)} />;
}
