import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdminSettingsPanel = () => {
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl md:text-3xl font-bold mb-6">權限管理</h1>
      <Card>
        <CardHeader>
          <CardTitle>權限設定</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">權限管理功能開發中...</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettingsPanel;
