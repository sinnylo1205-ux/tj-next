-- ======================================================================
-- 建立遞迴查詢函數：get_all_descendants
-- ======================================================================
-- 用途：遞迴查詢某個 parent_option_id 下的所有子孫選項（multi-level）

CREATE OR REPLACE FUNCTION public.get_all_descendants(parent_option_id integer)
RETURNS TABLE (
  option_id integer,
  option_name_zh character varying,
  option_code character varying,
  備註 text,
  is_default boolean,
  sort_order_master integer,
  metadata_master jsonb,
  logic_constraints jsonb,
  price_modifier numeric,
  is_final_option boolean,
  option_level integer,
  parent_id integer
)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE descendants AS (
    -- 第一層：直接子選項
    SELECT 
      m.option_id,
      m.option_name_zh,
      m.option_code,
      m.備註,
      m.is_default,
      m.sort_order_master,
      m.metadata_master,
      m.logic_constraints,
      m.price_modifier,
      m.is_final_option,
      m.option_level,
      m.parent_id
    FROM master_options m
    WHERE m.parent_id = parent_option_id
    
    UNION ALL
    
    -- 遞迴：子選項的子選項
    SELECT 
      m.option_id,
      m.option_name_zh,
      m.option_code,
      m.備註,
      m.is_default,
      m.sort_order_master,
      m.metadata_master,
      m.logic_constraints,
      m.price_modifier,
      m.is_final_option,
      m.option_level,
      m.parent_id
    FROM master_options m
    INNER JOIN descendants d ON m.parent_id = d.option_id
  )
  SELECT * FROM descendants;
$$;