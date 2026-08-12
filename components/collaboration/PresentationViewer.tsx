"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, List, MousePointer2, X } from "lucide-react";
import type { PhotoSlot, ProposalSlide, TocItem } from "@/lib/enterprise-proposal-slides";
import { SITE_CONFIG } from "@/lib/site";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import "./proposal-website.css";

/** 指定頁面：案例／方案圖片放大 */
const LARGE_PHOTO_SLIDE_IDS = new Set([14, 15, 16, 18]);

function PhotoSlotView({
  slot,
  onZoom,
  showClickHint,
}: {
  slot: PhotoSlot;
  onZoom?: (slot: PhotoSlot) => void;
  /** 僅中間圖顯示「點擊可放大」+ 鼠標 */
  showClickHint?: boolean;
}) {
  if (slot.src) {
    const zoomable = Boolean(onZoom);
    return (
      <div className={cn("tj-photo-slot", zoomable && "tj-photo-slot--zoomable")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 使用者自訂外部圖片 URL */}
        <img src={slot.src} alt={slot.alt} className="tj-photo-slot__img" />
        {zoomable && showClickHint ? (
          <span className="tj-photo-slot__cursor-hint" aria-hidden>
            <span className="tj-photo-slot__cursor-text">點擊可放大</span>
            <MousePointer2 className="tj-photo-slot__cursor-icon" strokeWidth={2.25} />
          </span>
        ) : null}
        {zoomable ? (
          <button
            type="button"
            className="tj-photo-slot__zoom-hit"
            aria-label={`放大檢視：${slot.alt}`}
            onClick={() => onZoom?.(slot)}
          />
        ) : null}
      </div>
    );
  }
  return (
    <div className="tj-photo-slot" data-slot-id={slot.slotId}>
      <span className="tj-photo-slot__label">{slot.label}</span>
    </div>
  );
}

/** 滿版三圖相簿：可點擊放大 */
function ZoomablePhotoGallery({
  slots,
  threeCol,
  photoOnly,
  enabled,
}: {
  slots: (PhotoSlot & { span2?: boolean })[];
  threeCol: boolean;
  photoOnly: boolean;
  /** 僅目前顯示的投影片允許放大層 */
  enabled: boolean;
}) {
  const [active, setActive] = useState<PhotoSlot | null>(null);

  useEffect(() => {
    if (!enabled) setActive(null);
  }, [enabled]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setActive(null);
      }
    };
    document.body.dataset.proposalPhotoLightbox = "1";
    window.addEventListener("keydown", onKey, true);
    return () => {
      delete document.body.dataset.proposalPhotoLightbox;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [active]);

  return (
    <>
      <div
        className={cn(
          "gallery min-h-0 flex-1",
          threeCol && "gallery--three",
          photoOnly && "gallery--photo-only",
        )}
      >
        {slots.map((s, i) => {
          const mid = Math.floor(slots.length / 2);
          return (
            <div key={s.slotId} className={cn(s.span2 && "span2")}>
              <PhotoSlotView
                slot={s}
                onZoom={s.src ? setActive : undefined}
                showClickHint={photoOnly && i === mid}
              />
            </div>
          );
        })}
      </div>
      {enabled && active?.src && typeof document !== "undefined"
        ? createPortal(
            <div
              className="tj-photo-lightbox"
              data-proposal-photo-lightbox
              role="dialog"
              aria-modal="true"
              aria-label={active.alt}
              onClick={() => setActive(null)}
            >
              <button
                type="button"
                className="tj-photo-lightbox__close"
                aria-label="關閉放大"
                onClick={() => setActive(null)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element -- 使用者自訂外部圖片 URL */}
              <img
                src={active.src}
                alt={active.alt}
                className="tj-photo-lightbox__img"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CornerBrand({ dark }: { dark?: boolean }) {
  return (
    <div className={cn("corner-brand", dark && "opacity-90")}>
      <SafeImage
        src={SITE_CONFIG.LOGO_URL}
        alt="T&J"
        width={156}
        height={112}
        className="h-full w-full object-contain"
        sizes="78px"
      />
    </div>
  );
}

function CornerRule({ text }: { text: string }) {
  return <div className="corner-rule">{text}</div>;
}

function SlideNum({ text }: { text: string }) {
  return <div className="slide-num">{text}</div>;
}

function Multiline({ text }: { text: string }) {
  const parts = text.split("\n");
  return (
    <>
      {parts.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </>
  );
}

function ProposalSlideArticle({ slide, active }: { slide: ProposalSlide; active: boolean }) {
  const dark = slide.template === "sectionHeader";

  const articleClass = cn(
    "tj-slide outline-none",
    dark && "tj-slide-dark",
    slide.template === "cover" && "cover",
    slide.template === "thanks" && "thanks",
    slide.template === "statement" && "statement",
  );

  const inner = (() => {
    switch (slide.template) {
      case "cover":
        return (
          <div className="frame">
            <CornerBrand />
            <div className="cover-grid min-h-0 flex-1">
              <div className="cover-left">
                <div>
                  <div className="cover-eyebrow">{slide.coverEyebrow}</div>
                  <div className="cover-rule" />
                  <h2 className="cover-title">
                    {slide.coverTitleBeforeEm}
                    <br />
                    <em>{slide.coverTitleEm}</em>
                    {slide.coverTitleAfterEm}
                  </h2>
                  <div className="cover-sub">{slide.coverSub}</div>
                </div>
                <div className="cover-meta">
                  {slide.coverMeta?.map((m, i) => (
                    <span key={m} className="flex items-baseline gap-3">
                      {i > 0 ? <span className="dot" aria-hidden /> : null}
                      <span>{m}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="cover-right">
                <div className="cover-hero-wrap proposal-photo-cell">
                  {slide.coverHeroSlot ? <PhotoSlotView slot={slide.coverHeroSlot} /> : null}
                </div>
                <div className="cover-stamp">
                  <div className="cover-stamp-inner">
                    {slide.stampLines?.map((line, i) => (
                      <span key={line}>
                        {i > 0 ? <br /> : null}
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "toc":
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className="eyebrow">CONTENTS</div>
            <h2 className="stitle mt-3">目錄</h2>
            <div className="toc-grid min-h-0 flex-1">
              <div className="toc-side">
                <div>
                  <div className="ital text-[clamp(16px,2.2vw,34px)] leading-snug text-[var(--tj-rose)]">
                    &ldquo;&nbsp;
                    <Multiline text={`${slide.tocQuoteLine1 ?? ""}\n${slide.tocQuoteLine2 ?? ""}`} />
                    &rdquo;
                  </div>
                </div>
                <div className="label">SEVEN&nbsp;&nbsp;CHAPTERS</div>
              </div>
              <ul className="toc-list">
                {slide.tocItems?.map((item, idx) => (
                  <li
                    key={item.zh}
                    className={cn("toc-item", idx === (slide.tocItems?.length ?? 0) - 1 && "!border-b-0")}
                  >
                    <span className="toc-num">{item.num}</span>
                    <span className="toc-title-zh">{item.zh}</span>
                    <span className="toc-en">{item.en}</span>
                  </li>
                ))}
              </ul>
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "sectionHeader":
        return (
          <div className="frame">
            <CornerBrand dark />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            {slide.displayNum ? <div className="display-num">{slide.displayNum}</div> : null}
            <div className="section-header-inner">
              {slide.chapterEyebrow ? (
                <div className="eyebrow" style={{ marginBottom: 16 }}>
                  {slide.chapterEyebrow}
                </div>
              ) : null}
              {slide.kicker ? <div className="kicker">{slide.kicker}</div> : null}
              <h2 className="section-h1">
                <Multiline text={slide.sectionTitle ?? ""} />
              </h2>
              <div className="small-rule" />
              {slide.sectionLede ? (
                <p className="lede">
                  <Multiline text={slide.sectionLede} />
                </p>
              ) : null}
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "statement":
        return (
          <div className="frame statement-inner">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            {slide.statementEyebrow ? (
              <div className="eyebrow" style={{ marginBottom: 32 }}>
                {slide.statementEyebrow}
              </div>
            ) : null}
            <p className="big">
              {slide.statementLine1}
              <br />
              {slide.statementMid1}
              <em>{slide.statementEm1}</em>
              {slide.statementMid2}
              <em>{slide.statementEm2}</em>
              {slide.statementEnd}
            </p>
            {slide.statementCaption ? <div className="caption">{slide.statementCaption}</div> : null}
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "serviceSplit":
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className="proposal-service-grid grid min-h-0 flex-1 grid-cols-1 items-center gap-6 @md/tj-deck:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)] @md/tj-deck:gap-10 @lg/tj-deck:gap-14">
              <div className="min-h-0 min-w-0">
                <div className="eyebrow">{slide.serviceEyebrow}</div>
                <h2 className="stitle mt-4">
                  <Multiline text={slide.serviceTitleLine1 ?? ""} />
                  <br />
                  <em>{slide.serviceTitleEm}</em>
                  {slide.serviceTitleLine2}
                </h2>
                <div className="my-8 h-px w-24 bg-[var(--tj-rose)]" />
                <p className="body max-w-[700px]">
                  <Multiline text={slide.serviceBody ?? ""} />
                </p>
                <div className="mt-10 flex gap-10">
                  <div>
                    <div className="ital text-[clamp(30px,4.4vw,52px)] leading-none text-[var(--tj-rose)]">
                      {slide.serviceNum}
                    </div>
                    <div className="label mt-2">{slide.serviceNumLabel}</div>
                    <div className="body mt-2 text-[clamp(13px,1.25vw,22px)]">{slide.serviceAxes}</div>
                  </div>
                </div>
              </div>
              <div className="proposal-photo-cell min-h-0 flex-1">
                {slide.servicePhotoSlot ? <PhotoSlotView slot={slide.servicePhotoSlot} /> : null}
              </div>
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "clientWall":
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className="eyebrow">{slide.wallEyebrow}</div>
            <h2 className="stitle mt-3">{slide.wallTitle}</h2>
            <div className="client-wall-scroll">
              <div className="client-wall">
                {slide.wallClients?.map((c) => (
                  <div key={c.nameZh} className="client-card">
                    <div className="client-frame">
                      <PhotoSlotView slot={c.photo} />
                    </div>
                    <div className="client-name">
                      {c.nameZh}
                      <span className="en">{c.nameEn}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="client-wall-foot mt-5 flex flex-wrap items-baseline justify-between gap-4">
                <div className="ital text-[clamp(14px,1.75vw,28px)] text-[var(--tj-rose)]">
                  &ldquo;&nbsp;{slide.wallQuote}&rdquo;
                </div>
                <div className="label">{slide.wallFootLabel}</div>
              </div>
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "plansOverview":
        return (
          <div className="frame frame--plans-overview">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className="eyebrow">{slide.plansEyebrow}</div>
            <h2 className="stitle mt-3">{slide.plansTitle}</h2>
            <div className="plans plans--overview">
              {slide.planCards?.map((p) => (
                <div key={p.letter} className={cn("plan", p.featured && "featured")}>
                  <div className="plan-name" style={p.featured ? { color: "var(--tj-rose-soft)" } : undefined}>
                    {p.letter}
                  </div>
                  <div className="plan-tag">{p.tagEn}</div>
                  <div className="plan-zh">
                    <Multiline text={p.zhLines.join("\n")} />
                  </div>
                  <div className="plan-divider" />
                  <p className="plan-desc">{p.desc}</p>
                  <div className="plan-foot">{p.footEn}</div>
                </div>
              ))}
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "planA":
      case "planC": {
        const isPlanA = slide.template === "planA";
        const isPlanC = slide.template === "planC";
        const photoLg = LARGE_PHOTO_SLIDE_IDS.has(slide.id);
        const grid = (
          <div
            className={cn(
              "proposal-plan-grid grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 @md/tj-deck:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)] @md/tj-deck:gap-6 @lg/tj-deck:gap-10",
              isPlanA && "proposal-plan-grid--plan-a",
              isPlanC && "proposal-plan-grid--plan-c",
              photoLg && !isPlanA && "proposal-plan-grid--photo-lg",
            )}
          >
            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="ital text-[clamp(18px,2.6vw,40px)] tracking-wide text-[var(--tj-rose)]">{slide.planItalic}</div>
              <div className="plan-letter-xl">{slide.planLetter}</div>
              <h2 className="stitle mt-4">
                {slide.planTitleLines?.map((line, i) => (
                  <span key={line}>
                    {i > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
                {slide.planTitleEm ? (
                  <>
                    <br />
                    <em>{slide.planTitleEm}</em>
                  </>
                ) : null}
              </h2>
              <div className="my-5 h-px w-24 bg-[var(--tj-rose)]" />
              <p className="body max-w-[640px]">{slide.planBody}</p>
              {slide.planTags ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {slide.planTags.map((t) => (
                    <span key={t} className="label border border-[var(--tj-line)] px-3 py-2 text-[clamp(10px,1vw,16px)]">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {slide.planGrid3 ? (
                <div className="proposal-plan-grid3 grid grid-cols-3">
                  {slide.planGrid3.map((g) => (
                    <div key={g.num} className="plan-grid3-item">
                      <div className="plan-grid3-num">{g.num}</div>
                      <div className="plan-grid3-text">{g.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div
              className={cn(
                "proposal-photo-cell flex min-h-0 flex-1 flex-col",
                isPlanA && "proposal-photo-cell--plan-a",
                isPlanC && "proposal-photo-cell--plan-c",
                photoLg && !isPlanA && "proposal-photo-cell--lg",
              )}
            >
              {slide.planPhotoSlot ? <PhotoSlotView slot={slide.planPhotoSlot} /> : null}
            </div>
          </div>
        );
        return (
          <div className={cn("frame", isPlanA && "frame--plan-a")}>
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            {grid}
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );
      }

      case "planB": {
        const photoSlots = slide.planPhotoSlots?.length
          ? slide.planPhotoSlots
          : slide.planPhotoSlot
            ? [slide.planPhotoSlot]
            : [];
        const grid = (
          <div className="proposal-plan-grid grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 @md/tj-deck:grid-cols-[minmax(0,1.32fr)_minmax(0,0.68fr)] @md/tj-deck:gap-6 @lg/tj-deck:gap-10">
            <div
              className={cn(
                "proposal-photo-cell order-1 flex min-h-0 flex-1 flex-col",
                photoSlots.length > 1 && "proposal-photo-cell--row",
              )}
            >
              {photoSlots.length > 1 ? (
                <div className="plan-b-photo-row">
                  {photoSlots.map((slot) => (
                    <PhotoSlotView key={slot.slotId} slot={slot} />
                  ))}
                </div>
              ) : photoSlots[0] ? (
                <PhotoSlotView slot={photoSlots[0]} />
              ) : null}
            </div>
            <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="ital text-[clamp(18px,2.6vw,40px)] tracking-wide text-[var(--tj-rose)]">{slide.planItalic}</div>
              <div className="plan-letter-lg">{slide.planLetter}</div>
              <h2 className="stitle mt-4">
                {slide.planTitleLines?.map((line, i) => (
                  <span key={line}>
                    {i > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </h2>
              <div className="my-5 h-px w-24 bg-[var(--tj-rose)]" />
              <p className="plan-b-body max-w-[640px]">{slide.planBody}</p>
              {slide.planBullets ? (
                <ul className="plan-b-bullets mt-3 grid list-none grid-cols-2 gap-2 gap-x-4 p-0">
                  {slide.planBullets.map((b) => (
                    <li key={b} className="plan-b-bullet">
                      — {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        );
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            {grid}
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );
      }

      case "caseSplitL":
      case "caseCorpL": {
        const photoLg = LARGE_PHOTO_SLIDE_IDS.has(slide.id);
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className={cn("case-split min-h-0 flex-1", photoLg && "case-split--photo-lg")}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {slide.caseMeta ? <div className="case-meta">{slide.caseMeta}</div> : null}
                <h2 className="stitle">
                  {slide.caseTitleLines?.[0]}
                  {slide.caseTitleEm ? (
                    <>
                      <br />
                      <em>{slide.caseTitleEm}</em>
                    </>
                  ) : null}
                </h2>
                {slide.caseDetail ? <p className="case-detail">{slide.caseDetail}</p> : null}
                {slide.caseQuote ? (
                  <div className="ital mt-10 max-w-[640px] text-[clamp(16px,2vw,32px)] leading-snug text-[var(--tj-rose)]">
                    &ldquo;&nbsp;
                    <Multiline text={slide.caseQuote} />
                    &rdquo;
                  </div>
                ) : null}
                {slide.palette?.length ? (
                  <div className="palette-row">
                    {slide.palette.map((sw, i) =>
                      sw.color === "transparent" ? (
                        <span key={i} className="palette-caption">
                          {sw.caption}
                        </span>
                      ) : (
                        <div key={sw.color} className="swatch" style={{ background: sw.color }} />
                      ),
                    )}
                  </div>
                ) : null}
              </div>
              <div className={cn("proposal-photo-cell flex min-h-0 flex-1 flex-col", photoLg && "proposal-photo-cell--lg")}>
                {slide.casePhotoSlot ? <PhotoSlotView slot={slide.casePhotoSlot} /> : null}
              </div>
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );
      }

      case "caseSplitR":
      case "caseCorpR": {
        const photoLg = LARGE_PHOTO_SLIDE_IDS.has(slide.id);
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className={cn("case-split case-split--rev min-h-0 flex-1", photoLg && "case-split--photo-lg")}>
              <div
                className={cn(
                  "proposal-photo-cell order-1 flex min-h-0 flex-1 flex-col @md/tj-deck:order-1",
                  photoLg && "proposal-photo-cell--lg",
                )}
              >
                {slide.casePhotoSlot ? <PhotoSlotView slot={slide.casePhotoSlot} /> : null}
              </div>
              <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col @md/tj-deck:order-2">
                {slide.caseMeta ? <div className="case-meta">{slide.caseMeta}</div> : null}
                <h2 className="stitle">
                  {slide.caseTitleLines?.[0]}
                  {slide.caseTitleEm ? (
                    <>
                      <br />
                      <em>{slide.caseTitleEm}</em>
                    </>
                  ) : null}
                </h2>
                {slide.caseDetail ? <p className="case-detail">{slide.caseDetail}</p> : null}
                {slide.palette?.length ? (
                  <div className="palette-row">
                    {slide.palette.map((sw, i) =>
                      sw.color === "transparent" ? (
                        <span key={i} className="palette-caption">
                          {sw.caption}
                        </span>
                      ) : (
                        <div key={sw.color + i} className="swatch" style={{ background: sw.color }} />
                      ),
                    )}
                  </div>
                ) : null}
                {slide.caseStatLeftNum ? (
                  <div className="mt-10 flex items-baseline gap-6">
                    <div>
                      <div className="ital text-[clamp(32px,5vw,58px)] leading-none text-[var(--tj-rose)]">
                        {slide.caseStatLeftNum}
                      </div>
                      <div className="label mt-2">{slide.caseStatLeftLabel}</div>
                    </div>
                    <div className="text-[clamp(20px,2.65vw,40px)] text-[var(--tj-ink-mute)]">／</div>
                    <div>
                      <div className="ital text-[clamp(32px,5vw,58px)] leading-none text-[var(--tj-rose)]">
                        {slide.caseStatRightNum}
                      </div>
                      <div className="label mt-2">{slide.caseStatRightLabel}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );
      }

      case "galleryWall": {
        const photoOnly = Boolean(slide.galleryPhotoOnly);
        const threeCol =
          (slide.gallerySlots?.length ?? 0) > 0 && (slide.gallerySlots?.length ?? 0) <= 3;
        const slots = slide.gallerySlots ?? [];
        return (
          <div className={cn("frame", photoOnly && "frame--gallery-photo-only")}>
            {!photoOnly ? <CornerBrand /> : null}
            {!photoOnly && slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            {photoOnly ? (
              <div className="gallery-photo-only-chrome">
                <div className="gallery-photo-only-label">{slide.galleryEyebrow || "合作作品"}</div>
              </div>
            ) : (
              <>
                <div className="eyebrow">{slide.galleryEyebrow}</div>
                <h2 className="stitle mt-3">
                  {slide.galleryTitleBeforeEm}
                  <em>{slide.galleryTitleEm}</em>
                </h2>
                {slide.galleryBody ? <p className="body mt-3 max-w-[1100px]">{slide.galleryBody}</p> : null}
              </>
            )}
            {photoOnly ? (
              <ZoomablePhotoGallery slots={slots} threeCol={threeCol} photoOnly enabled={active} />
            ) : (
              <div
                className={cn(
                  "gallery min-h-0 flex-1",
                  threeCol && "gallery--three",
                )}
              >
                {slots.map((s) => (
                  <div key={s.slotId} className={cn(s.span2 && "span2")}>
                    <PhotoSlotView slot={s} />
                  </div>
                ))}
              </div>
            )}
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );
      }

      case "whyGrid":
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className="eyebrow">{slide.whyEyebrow}</div>
            <h2 className="stitle mt-3">
              {slide.whyTitleBeforeEm}
              <em>{slide.whyTitleEm}</em>
              {slide.whyTitleAfterEm}
            </h2>
            <div className="why-grid min-h-0 flex-1">
              {slide.whyCards?.map((w) => (
                <div key={w.num} className="why-card">
                  <div>
                    <div className="why-num">{w.num}</div>
                    <div className="why-en">{w.en}</div>
                  </div>
                  <div className="why-title">{w.title}</div>
                  <p className="why-desc">{w.desc}</p>
                </div>
              ))}
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "process":
        return (
          <div className="frame">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            <div className="eyebrow">{slide.processEyebrow}</div>
            <h2 className="stitle mt-3">
              {slide.processTitleBeforeEm}
              <em>{slide.processTitleEm}</em>
              {slide.processTitleAfterEm}
            </h2>
            {slide.processLead ? <p className="body mt-3">{slide.processLead}</p> : null}
            <div className="process min-h-0 flex-1">
              {slide.processSteps?.map((s) => (
                <div key={s.num} className="step">
                  <div className="step-num">{s.num}</div>
                  <div className="step-en">{s.en}</div>
                  <div className="step-title">{s.title}</div>
                  <p className="step-desc">{s.desc}</p>
                </div>
              ))}
            </div>
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      case "thanks":
        return (
          <div className="frame thanks-inner">
            <CornerBrand />
            {slide.cornerRule ? <CornerRule text={slide.cornerRule} /> : null}
            {slide.thanksRose ? <div className="thanks-rose">{slide.thanksRose}</div> : null}
            <div className="thanks-hero">{slide.thanksHero}</div>
            <div className="thanks-line" />
            <div className="thanks-sub">
              {slide.thanksLines?.map((line, i) => (
                <span key={i}>
                  {line === "" ? (
                    <br />
                  ) : (
                    <>
                      {line}
                      <br />
                    </>
                  )}
                </span>
              ))}
            </div>
            {slide.contactRow && slide.contactRow.length > 0 ? (
              <div className="contact-row">
                {slide.contactRow.map((c) => (
                  <div key={c.title} className="contact flex flex-col gap-1">
                    <span className="ctitle">{c.title}</span>
                    <span className="cval">{c.val}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {slide.slideNum ? <SlideNum text={slide.slideNum} /> : null}
          </div>
        );

      default:
        return null;
    }
  })();

  return (
    <article
      id={`slide-${slide.id}`}
      lang="zh-Hant"
      className={cn(
        articleClass,
        "absolute inset-0 h-full w-full overflow-hidden",
        active ? "z-[1] block" : "hidden",
      )}
      aria-hidden={!active}
      tabIndex={active ? 0 : -1}
      data-label={slide.dataLabel}
    >
      {inner}
    </article>
  );
}

type PresentationViewerProps = {
  slides: ProposalSlide[];
  toc: TocItem[];
  deckTitle: string;
  /** 若為 true，目錄列顯示在簡報舞台上方（標題／介紹之下），不在舞台下方重複。 */
  tocBeforeDeck?: boolean;
};

export function PresentationViewer({ slides, toc, deckTitle, tocBeforeDeck = false }: PresentationViewerProps) {
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const tocTitleId = useId();

  const current = slides[index];
  const currentId = current?.id ?? 1;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setIndex(clamped);
      if (typeof window !== "undefined") {
        const id = slides[clamped]?.id;
        if (id != null) {
          window.history.replaceState(null, "", `#slide-${id}`);
        }
      }
    },
    [slides, total],
  );

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const m = /^#slide-(\d+)$/.exec(hash);
    if (m) {
      const id = parseInt(m[1], 10);
      const i = slides.findIndex((s) => s.id === id);
      if (i >= 0) setIndex(i);
    }
  }, [slides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.body.dataset.proposalPhotoLightbox === "1") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
      if (e.key === "Escape") setTocOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const tocItemsResolved = useMemo(
    () =>
      toc.map((item) => {
        const i = slides.findIndex((s) => s.id === item.slideId);
        return { ...item, index: i };
      }),
    [slides, toc],
  );

  const tocNav = (
    <nav
      className={tocBeforeDeck ? "mb-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm" : "mt-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"}
      aria-labelledby={tocTitleId}
    >
      <p id={tocTitleId} className="font-sans text-sm font-semibold text-ink">
        本頁目錄（可點擊跳轉）
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 font-sans text-sm">
        {tocItemsResolved.map((item) => (
          <li key={item.label}>
            <a
              href={`#slide-${item.slideId}`}
              className="inline-block rounded-full border border-brand-300/50 bg-brand-50 px-3 py-1.5 text-brand-600 underline-offset-2 hover:bg-brand-100 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                if (item.index >= 0) go(item.index);
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <section className="relative pb-24 md:pb-28" aria-label={deckTitle}>
      {tocBeforeDeck ? tocNav : null}
      <div className="@container/tj-deck tj-proposal-deck-shell relative overflow-hidden rounded-xl shadow-[var(--elev-card)]">
        <div className="tj-proposal relative h-full min-h-0 w-full">
          {slides.map((slide, i) => (
            <ProposalSlideArticle key={slide.id} slide={slide} active={i === index} />
          ))}
        </div>
      </div>

      {!tocBeforeDeck ? tocNav : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center pb-4 md:pb-6">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-brand-300/50 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-sm md:gap-3 md:px-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-35"
            onClick={() => go(index - 1)}
            disabled={index <= 0}
            aria-label="上一頁"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          <span className="min-w-[4.5rem] text-center font-sans text-xs text-muted-foreground tabular-nums md:text-sm">
            {currentId} / {total}
          </span>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-35"
            onClick={() => go(index + 1)}
            disabled={index >= total - 1}
            aria-label="下一頁"
          >
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:ml-1"
            onClick={() => setTocOpen(true)}
            aria-label="開啟完整目錄"
            aria-expanded={tocOpen}
          >
            <List className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {tocOpen && (
        <div
          className="fixed inset-0 z-[950] flex items-end justify-center bg-black/40 p-4 md:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${tocTitleId}-modal`}
          onClick={() => setTocOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p id={`${tocTitleId}-modal`} className="font-serif text-lg font-semibold text-ink">
                跳轉至章節
              </p>
              <button
                type="button"
                className="rounded-full p-2 text-ink hover:bg-accent"
                onClick={() => setTocOpen(false)}
                aria-label="關閉目錄"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 font-sans text-sm text-ink">
              {tocItemsResolved.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => {
                      if (item.index >= 0) go(item.index);
                      setTocOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-4 font-sans text-xs text-muted-foreground">亦可用鍵盤左右鍵切換頁面。</p>
          </div>
        </div>
      )}
    </section>
  );
}
