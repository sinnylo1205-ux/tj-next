import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdminProductsPanel = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">商品管理</h1>
      <Card>
        <CardHeader>
          <CardTitle>商品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">商品管理功能開發中...</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProductsPanel;
