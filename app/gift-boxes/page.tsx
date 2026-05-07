import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { createSupabasePublicUncached } from "@/lib/supabase-blog-public";
import { QUERY_KEYS } from "@/lib/react-query-keys";
import {
  fetchAllGiftBoxesPageData,
  resolveGiftBoxBackgroundDesktop,
  resolveGiftBoxBackgroundMobile,
  type GiftBoxBackgroundSection,
} from "@/lib/gift-boxes-queries";
import { GiftBoxesRouter } from "./GiftBoxesRouter";

function firstHeroPreloadUrls(sections: GiftBoxBackgroundSection[]) {
  const heroSection = sections.find((s) => s.sort_order === 1) ?? [...sections].sort((a, b) => a.sort_order - b.sort_order)[0];
  if (!heroSection?.photo_url) return { desktop: null as string | null, mobile: null as string | null };
  const d = resolveGiftBoxBackgroundDesktop(heroSection);
  const m = resolveGiftBoxBackgroundMobile(heroSection);
  return {
    desktop: d.url || null,
    mobile: heroSection.photo_url_mobile ? m.url : null,
  };
}

export default async function GiftBoxesPage() {
  const supabase = createSupabasePublicUncached();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000 },
    },
  });

  try {
    const data = await fetchAllGiftBoxesPageData(supabase);
    queryClient.setQueryData(QUERY_KEYS.giftBoxesBackground, data.backgroundSections);
    queryClient.setQueryData(QUERY_KEYS.giftBoxesForeground, data.foregroundItems);
    queryClient.setQueryData(QUERY_KEYS.giftBoxesProducts, data.products);
    queryClient.setQueryData(QUERY_KEYS.giftBoxesNotices, data.productNotices);
  } catch {
    // 交由 client 重新請求；維持空 cache
  }

  const dehydratedState = dehydrate(queryClient);
  const bgData = queryClient.getQueryData<GiftBoxBackgroundSection[]>(QUERY_KEYS.giftBoxesBackground);
  const hero = bgData ? firstHeroPreloadUrls(bgData) : { desktop: null, mobile: null };

  return (
    <>
      {hero.desktop ? (
        <link rel="preload" as="image" href={hero.desktop} fetchPriority="high" media="(min-width: 768px)" />
      ) : null}
      {hero.mobile ? (
        <link rel="preload" as="image" href={hero.mobile} fetchPriority="high" media="(max-width: 767px)" />
      ) : null}
      <HydrationBoundary state={dehydratedState}>
        <GiftBoxesRouter />
      </HydrationBoundary>
    </>
  );
}
