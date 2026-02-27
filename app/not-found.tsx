import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-ink">404</h1>
        <p className="mb-4 text-xl text-ink-muted">找不到頁面</p>
        <Link href="/" className="text-brand-600 underline hover:no-underline">
          返回首頁
        </Link>
      </div>
    </div>
  );
}
