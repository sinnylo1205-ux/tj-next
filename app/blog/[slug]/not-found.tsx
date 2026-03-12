import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BlogPostNotFound() {
  return (
    <div className="container py-12 text-center">
      <h1 className="text-2xl font-bold mb-4">找不到文章</h1>
      <p className="text-muted-foreground mb-6">您所尋找的部落格文章不存在或尚未發布。</p>
      <Button asChild variant="outline">
        <Link href="/blog">返回部落格</Link>
      </Button>
    </div>
  );
}
