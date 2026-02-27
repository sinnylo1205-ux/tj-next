// ======================================================================
// useOptionNames.ts — 從資料庫載入選項名稱
// ======================================================================

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface OptionName {
  option_id: number;
  option_name_zh: string;
}

export function useOptionNames(optionIds: number[]) {
  const [optionNames, setOptionNames] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (optionIds.length === 0) {
      setIsLoading(false);
      return;
    }

    const loadOptionNames = async () => {
      try {
        const { data, error } = await supabase
          .from("master_options")
          .select("option_id, option_name_zh")
          .in("option_id", optionIds);

        if (error) throw error;

        const nameMap = new Map<number, string>();
        data?.forEach((opt: OptionName) => {
          nameMap.set(opt.option_id, opt.option_name_zh);
        });

        setOptionNames(nameMap);
      } catch (err) {
        console.error("載入選項名稱失敗:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadOptionNames();
  }, [JSON.stringify(optionIds)]);

  return { optionNames, isLoading };
}
