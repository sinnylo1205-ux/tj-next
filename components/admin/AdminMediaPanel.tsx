"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminWebsiteMaterialsSection from "./AdminWebsiteMaterialsSection";
import AdminArticlesSection from "./AdminArticlesSection";

/** 後台「內容管理」：外層分「網站素材」與「文章管理」 */
const AdminMediaPanel = () => {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-xl md:text-3xl font-bold">內容管理</h1>

      <Tabs defaultValue="site" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-md bg-secondary p-1 text-secondary-foreground">
          <TabsTrigger value="site">網站素材</TabsTrigger>
          <TabsTrigger value="articles">文章管理</TabsTrigger>
        </TabsList>

        <TabsContent value="site" className="mt-6 focus-visible:outline-none">
          <AdminWebsiteMaterialsSection />
        </TabsContent>

        <TabsContent value="articles" className="mt-6 focus-visible:outline-none">
          <AdminArticlesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminMediaPanel;
