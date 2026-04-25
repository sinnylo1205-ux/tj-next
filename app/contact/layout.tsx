import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const jsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "聯絡我們", path: "/contact" },
]);

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
