import { getClassicData } from "./getClassicData";
import { ClassicStylesClient } from "./ClassicStylesClient";

export default async function ClassicStylesPage() {
  const initialData = await getClassicData();
  return <ClassicStylesClient initialData={initialData} />;
}
