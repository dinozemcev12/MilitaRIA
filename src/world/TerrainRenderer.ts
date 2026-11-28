/* ============================================================
   world/TerrainRenderer.ts — спутниковый рельеф
   Загружает base64 Blue Marble JPEG и рисует его в нужный
   screenRect без каких-либо процедурных оверлеев.
   ============================================================ */
import { RELIEF_DATA_URL } from './reliefData.js';

const LAT_MIN = -62;
const LAT_MAX = 84;
const TEX_LAT_SPAN = 180; // текстура покрывает -90 → +90

export class TerrainRenderer {
  private img: HTMLImageElement | null = null;
  private ready = false;
  private loading = false;

  load(onReady: () => void): void {
    if (this.ready) { onReady(); return; }
    if (this.loading) return;
    this.loading = true;

    const image = new Image();
    image.onload = () => {
      this.img = image;
      this.ready = true;
      this.loading = false;
      console.log('[TerrainRenderer] ready', image.naturalWidth, 'x', image.naturalHeight);
      onReady();
    };
    image.onerror = (e) => {
      this.loading = false;
      console.error('[TerrainRenderer] load error', e);
    };
    image.src = RELIEF_DATA_URL;
  }

  isReady(): boolean {
    return this.ready && this.img !== null;
  }

  /**
   * Рисует спутниковый рельеф в screenRect.
   * Вызывать внутри ctx.save() / ctx.clip() / ctx.restore().
   */
  drawRelief(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    screenW: number,
    screenH: number
  ): void {
    if (!this.img) return;

    const iw = this.img.naturalWidth || this.img.width;
    const ih = this.img.naturalHeight || this.img.height;

    // Вырезаем только нужный диапазон широт из текстуры
    const srcY = ((90 - LAT_MAX) / TEX_LAT_SPAN) * ih;
    const srcH = ((LAT_MAX - LAT_MIN) / TEX_LAT_SPAN) * ih;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, 0, srcY, iw, srcH, screenX, screenY, screenW, screenH);
    ctx.restore();
  }
}
