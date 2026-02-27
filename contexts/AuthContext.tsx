"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

const DISABLE_SUPABASE = false; // ✅ 本機測試模式：關閉所有 Supabase 連線

interface AuthContextType {
  user: any;
  hasLineLinked: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, hasLineLinked: false });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [hasLineLinked, setHasLineLinked] = useState(false);

  useEffect(() => {
    if (DISABLE_SUPABASE) {
      console.log("🚫 [AuthContext] Supabase disabled - using local mode");
      return; // 🔒 跳過所有連線
    }

    // ✅ 正常連線模式
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ✅ 監聽用戶變化，檢查是否已連結 LINE
  useEffect(() => {
    if (DISABLE_SUPABASE || !user) {
      setHasLineLinked(false);
      return;
    }

    const checkLineLinked = async () => {
      try {
        const { data, error } = await supabase
          .from("user_log_in")
          .select("line_user_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!error && data) {
          setHasLineLinked(!!data.line_user_id);
        } else {
          setHasLineLinked(false);
        }
      } catch (err) {
        console.error("檢查 LINE 連結狀態失敗:", err);
        setHasLineLinked(false);
      }
    };

    checkLineLinked();
  }, [user]);

  return <AuthContext.Provider value={{ user, hasLineLinked }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
