import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const jsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "關於我們", path: "/about" },
]);

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
