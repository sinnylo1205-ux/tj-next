/**
 * CRM 手寫公司名稱清除 patch。
 * 清除時必須 UPDATE company_name=null，不可 DELETE 整列，
 * 否則會一併清掉同列的 wakeup_opt_out 等偏好。
 */
export function buildClearCustomerCompanyNamePatch(
  updatedBy: string | null,
  now = new Date().toISOString(),
): { company_name: null; updated_at: string; updated_by: string | null } {
  return {
    company_name: null,
    updated_at: now,
    updated_by: updatedBy,
  };
}
