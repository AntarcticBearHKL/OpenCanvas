import { useEffect, useMemo, useState } from "react";
import { App, Button, Modal, Segmented } from "antd";
import { Crop } from "lucide-react";
import { useTranslation } from "react-i18next";

import { computePerceptualHash, extractImagePalette, readImageExif, suggestSmartCrop } from "@/lib/image/image-algorithms";
import { cropDataUrl } from "@/lib/canvas/canvas-image-data";
import { readImageMeta } from "@/lib/image-utils";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

const ratios = ["1:1", "4:3", "3:4", "16:9", "9:16"];

function parseAspect(value: string) {
    const [width, height] = value.split(":").map(Number);
    return width > 0 && height > 0 ? width / height : 1;
}

function formatExifValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toLocaleString();
    if (Array.isArray(value)) return value.map((item) => formatExifValue(item)).join(", ");
    if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return `${value.length} bytes`;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

export function CanvasImageAnalysisDialog({ dataUrl, open, onClose, onCrop }: { dataUrl: string; open: boolean; onClose: () => void; onCrop: (dataUrl: string) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [palette, setPalette] = useState<string[]>([]);
    const [exif, setExif] = useState<Record<string, unknown> | null>(null);
    const [hash, setHash] = useState("");
    const [ratio, setRatio] = useState(ratios[0]);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [cropping, setCropping] = useState(false);
    const exifRows = useMemo(() => (exif ? Object.entries(exif).map(([key, value]) => ({ key, value: formatExifValue(value) })) : []), [exif]);

    useEffect(() => {
        if (!open) return;
        setPalette([]);
        setExif(null);
        setHash("");
        setImage(null);
        void readImageMeta(dataUrl).then(setImage);
        void extractImagePalette(dataUrl).then(setPalette).catch(() => setPalette([]));
        void readImageExif(dataUrl).then(setExif);
        void computePerceptualHash(dataUrl).then(setHash).catch(() => setHash(""));
    }, [dataUrl, open]);

    const crop = async () => {
        if (!image) return;
        setCropping(true);
        try {
            const area = await suggestSmartCrop(dataUrl, parseAspect(ratio));
            const cropped = await cropDataUrl(dataUrl, { x: area.x / image.width, y: area.y / image.height, width: area.width / image.width, height: area.height / image.height });
            onCrop(cropped);
            message.success(t("canvas.imageAnalysis.cropDone"));
        } catch {
            message.error(t("canvas.imageAnalysis.cropFailed"));
        } finally {
            setCropping(false);
        }
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={820} centered destroyOnHidden>
            <div className="space-y-5">
                <h2 className="text-xl font-semibold">{t("canvas.imageAnalysis.title")}</h2>
                <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_360px]">
                    <div className="min-w-0 space-y-4">
                        <div className="grid min-h-[220px] place-items-center rounded-xl border p-4">
                            <img src={dataUrl} alt="" className="max-h-[260px] max-w-full rounded-lg object-contain" draggable={false} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.imageAnalysis.palette")}</div>
                            <div className="flex flex-wrap gap-2">
                                {palette.length ? (
                                    palette.map((color, index) => (
                                        <div key={`${color}-${index}`} className="flex items-center gap-2">
                                            <span className="size-7 rounded-md border" style={{ backgroundColor: color, borderColor: theme.node.stroke }} />
                                            <span className="font-mono text-xs uppercase opacity-70">{color}</span>
                                        </div>
                                    ))
                                ) : (
                                    <span className="text-xs opacity-55">{t("canvas.editors.loading")}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="min-w-0 space-y-4">
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.imageAnalysis.exif")}</div>
                            {exifRows.length ? (
                                <div className="max-h-52 overflow-auto rounded-xl border">
                                    <table className="w-full text-xs">
                                        <tbody>
                                            {exifRows.map((row) => (
                                                <tr key={row.key} className="border-b border-border/60 last:border-b-0">
                                                    <td className="w-1/3 break-all px-3 py-2 align-top opacity-60">{row.key}</td>
                                                    <td className="break-all px-3 py-2 align-top">{row.value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="rounded-xl border px-3 py-2 text-xs opacity-55">{t("canvas.imageAnalysis.exifEmpty")}</div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.imageAnalysis.hash")}</div>
                            <div className="rounded-xl border px-3 py-2 font-mono text-xs break-all">{hash || t("canvas.editors.loading")}</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.imageAnalysis.cropRatio")}</div>
                            <Segmented block size="small" value={ratio} options={ratios} onChange={(value) => setRatio(String(value))} />
                        </div>
                        <div className="flex justify-end">
                            <Button type="primary" icon={<Crop className="size-4" />} loading={cropping} disabled={!image || cropping} onClick={() => void crop()}>
                                {t("canvas.imageAnalysis.smartCrop")}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
