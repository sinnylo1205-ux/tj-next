/**
 * 登入後購物車同步計畫：只更新／插入本分頁看得到的列。
 * 不可把「DB 有、本分頁快照沒有」當成使用者刪除——其他分頁剛加入的客製列會被誤標 is_submitted。
 */

export type CartPersistIdRow = { id: string };

export type CartPersistPlan = {
  updateIds: string[];
  insertIds: string[];
  /** 永遠為空。軟刪除只走 removeFromCart / removeItemsByIds / clearCart。 */
  softDeleteIds: string[];
};

export function planCartPersist(
  existingDbRows: CartPersistIdRow[],
  newItems: CartPersistIdRow[],
): CartPersistPlan {
  const existingDbIdSet = new Set(existingDbRows.map((row) => row.id));
  return {
    updateIds: newItems.filter((item) => existingDbIdSet.has(item.id)).map((item) => item.id),
    insertIds: newItems.filter((item) => !existingDbIdSet.has(item.id)).map((item) => item.id),
    softDeleteIds: [],
  };
}
