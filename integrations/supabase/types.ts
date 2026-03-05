/**
 * Supabase JSON 欄位型別，供 admin 等元件使用。
 * 若專案有執行 supabase gen types，可改為從生成的 types 匯入。
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
