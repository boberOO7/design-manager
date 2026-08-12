"use client";

import { LoaderCircle, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const CROP_SIZE = 256;
const OUTPUT_SIZE = 512;

type ImageDimensions = { height: number; width: number };

function clamp(value: number, maximum: number) {
  return Math.min(Math.max(value, -maximum), maximum);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Avatar file could not be read"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Avatar file could not be read"));
    reader.readAsDataURL(file);
  });
}

async function loadImageDimensions(sourceUrl: string): Promise<ImageDimensions> {
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  return { height: image.naturalHeight, width: image.naturalWidth };
}

async function createCroppedAvatar({ dimensions, offsetX, offsetY, sourceUrl, zoom }: {
  dimensions: ImageDimensions;
  offsetX: number;
  offsetY: number;
  sourceUrl: string;
  zoom: number;
}): Promise<File> {
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.height = OUTPUT_SIZE;
  canvas.width = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const baseScale = Math.max(OUTPUT_SIZE / dimensions.width, OUTPUT_SIZE / dimensions.height);
  const scaledWidth = dimensions.width * baseScale * zoom;
  const scaledHeight = dimensions.height * baseScale * zoom;
  context.drawImage(image, (OUTPUT_SIZE - scaledWidth) / 2 + offsetX * (OUTPUT_SIZE / CROP_SIZE), (OUTPUT_SIZE - scaledHeight) / 2 + offsetY * (OUTPUT_SIZE / CROP_SIZE), scaledWidth, scaledHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Avatar crop could not be created");
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

export function AvatarCropStep({ file, onCancel, onConfirm, onFailure }: {
  file: File;
  onCancel: () => void;
  onConfirm: (avatarFile: File, originalFile: File) => Promise<void>;
  onFailure: () => void;
}) {
  const t = useTranslations("Account");
  const dragStartRef = useRef<{ offsetX: number; offsetY: number; pointerX: number; pointerY: number } | null>(null);
  const onCancelRef = useRef(onCancel);
  const onFailureRef = useRef(onFailure);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onCancelRef.current = onCancel;
    onFailureRef.current = onFailure;
  }, [onCancel, onFailure]);

  useEffect(() => {
    let cancelled = false;
    void readFileAsDataUrl(file).then(async (nextSourceUrl) => {
      const nextDimensions = await loadImageDimensions(nextSourceUrl);
      if (cancelled) return;
      setSourceUrl(nextSourceUrl);
      setDimensions(nextDimensions);
    }).catch(() => {
      if (cancelled) return;
      onFailureRef.current();
      onCancelRef.current();
    });
    return () => { cancelled = true; };
  }, [file]);

  const imageStyle = useMemo(() => {
    if (!dimensions) return undefined;
    const baseScale = Math.max(CROP_SIZE / dimensions.width, CROP_SIZE / dimensions.height);
    const width = dimensions.width * baseScale * zoom;
    const height = dimensions.height * baseScale * zoom;
    return {
      height,
      transform: `translate(${(CROP_SIZE - width) / 2 + offsetX}px, ${(CROP_SIZE - height) / 2 + offsetY}px)`,
      width,
    };
  }, [dimensions, offsetX, offsetY, zoom]);

  function limitOffsets(nextX: number, nextY: number, nextZoom = zoom) {
    if (!dimensions) return { x: 0, y: 0 };
    const baseScale = Math.max(CROP_SIZE / dimensions.width, CROP_SIZE / dimensions.height);
    const maximumX = Math.max(0, (dimensions.width * baseScale * nextZoom - CROP_SIZE) / 2);
    const maximumY = Math.max(0, (dimensions.height * baseScale * nextZoom - CROP_SIZE) / 2);
    return { x: clamp(nextX, maximumX), y: clamp(nextY, maximumY) };
  }

  function changeZoom(nextZoom: number) {
    const boundedZoom = Math.min(Math.max(nextZoom, 1), 3);
    const offsets = limitOffsets(offsetX, offsetY, boundedZoom);
    setZoom(boundedZoom);
    setOffsetX(offsets.x);
    setOffsetY(offsets.y);
  }

  async function confirmCrop() {
    if (!dimensions || !sourceUrl) return;
    setIsSubmitting(true);
    try {
      await onConfirm(await createCroppedAvatar({ dimensions, offsetX, offsetY, sourceUrl, zoom }), file);
    } catch {
      onFailureRef.current();
    } finally {
      setIsSubmitting(false);
    }
  }

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="mx-auto overflow-hidden rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)]" style={{ height: CROP_SIZE, width: CROP_SIZE }}>
      {imageStyle && sourceUrl ? <>
        {/* This local data URL cannot use the app image loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="max-w-none select-none touch-none object-cover" draggable={false} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragStartRef.current = { offsetX, offsetY, pointerX: event.clientX, pointerY: event.clientY }; }} onPointerMove={(event) => { const start = dragStartRef.current; if (!start) return; const offsets = limitOffsets(start.offsetX + event.clientX - start.pointerX, start.offsetY + event.clientY - start.pointerY); setOffsetX(offsets.x); setOffsetY(offsets.y); }} onPointerUp={() => { dragStartRef.current = null; }} src={sourceUrl} style={imageStyle} />
      </> : <div className="grid size-full place-items-center"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-[var(--ui-text-muted)]" /></div>}
    </div>
    <p className="text-center text-sm text-[var(--ui-text-muted)]">{t("cropAvatarHint")}</p>
    <label className="grid gap-2 text-sm font-medium text-[var(--ui-text)]"><span className="flex items-center gap-2"><ZoomIn aria-hidden="true" className="size-4" />{t("zoom")}</span><input data-dialog-initial-focus aria-label={t("zoom")} className="accent-[var(--ui-focus)]" disabled={!dimensions || isSubmitting} max="3" min="1" onChange={(event) => changeZoom(Number(event.target.value))} step="0.01" type="range" value={zoom} /></label>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button disabled={isSubmitting} onClick={onCancel} type="button" variant="outline">{t("cancel")}</Button><Button disabled={!dimensions || isSubmitting} onClick={() => void confirmCrop()} type="button">{isSubmitting ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />{t("preparingPhoto")}</> : t("usePhoto")}</Button></div>
  </div>;
}
