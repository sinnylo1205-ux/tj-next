import { useEffect, useState } from "react";

export function RightSlideHint() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 30 秒後顯示
    const showTimer = setTimeout(() => {
      setMounted(true);
      // 下一個 tick 再設 visible，確保 transition 生效
      requestAnimationFrame(() => setVisible(true));
    }, 30000);

    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // 顯示 5 秒後滑出
    const hideTimer = setTimeout(() => {
      setVisible(false);
      // 等動畫結束後卸載
      setTimeout(() => setMounted(false), 500);
    }, 5000);

    return () => clearTimeout(hideTimer);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`
        fixed top-1/2 right-0 z-[9999]
        -translate-y-1/2
        transition-transform duration-500 ease-out
        ${visible ? "translate-x-0" : "translate-x-full"}
      `}
    >
      <a href="https://lin.ee/FJqAxNU" target="_blank" rel="noopener noreferrer" className="block">
        <img
          src="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/hint2__1_-removebg-preview.png"
          alt="加入 T&J 官方 LINE"
          className="w-[280px] max-w-[80vw] cursor-pointer select-none"
        />
      </a>
    </div>
  );
}
