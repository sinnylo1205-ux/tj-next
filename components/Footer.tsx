"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Instagram, Facebook, Mail, MessageCircle, Settings } from "lucide-react";

const LINE_URL = "https://lin.ee/Tp9U5bf";

/** Lovable 後台網址，設於 .env.local 的 NEXT_PUBLIC_ADMIN_URL，僅供內部使用 */
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL;

const Footer = () => {
  const router = useRouter();

  return (
    <footer className="bg-brand-500 text-ink-inverse py-12 mt-auto">
      <div className="container">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <h3 className="font-semibold text-lg mb-4">T&J 客製化甜點</h3>
            <p className="text-ink-inverse/80 text-sm leading-relaxed">
              手作甜點，為您的特別時刻
              <br />
              增添甜蜜回憶
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">重要連結</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-ink-inverse/80 hover:text-ink-inverse transition-colors text-sm">
                  合約條款
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-ink-inverse/80 hover:text-ink-inverse transition-colors text-sm">
                  隱私權政策
                </Link>
              </li>
              {ADMIN_URL && (
                <li>
                  <a
                    href={ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-inverse/80 hover:text-ink-inverse transition-colors text-sm inline-flex items-center gap-1"
                  >
                    <Settings size={14} />
                    後台管理
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Social Media */}
          <div>
            <h3 className="font-semibold text-lg mb-4">聯絡我們</h3>

            <div className="flex gap-4 mb-4">
              <a
                href="https://www.instagram.com/tjcookies99/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={20} />
              </a>
              <a
                href="https://www.facebook.com/TjFortuneCookies/?locale=zh_TW"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={20} />
              </a>
              <button
                type="button"
                onClick={() => router.push("/contact")}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="聯絡我們"
              >
                <Mail size={20} />
              </button>
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="LINE 官方帳號"
              >
                <MessageCircle size={20} />
              </a>
            </div>
            <a
              href="mailto:tj.tjump@gmail.com"
              className="text-ink-inverse/80 hover:text-ink-inverse transition-colors text-sm"
            >
              tj.tjump@gmail.com
            </a>
          </div>
        </div>

        <div className="border-t border-white/20 pt-6 text-center">
          <p className="text-ink-inverse/60 text-sm">
            © {new Date().getFullYear()} T&J 客製化甜點. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
