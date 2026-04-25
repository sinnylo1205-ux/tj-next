import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const jsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "甜點茶會佈置", path: "/gallery" },
]);

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
