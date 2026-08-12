import React, { useRef, useState, useEffect } from 'react';
import { X, Download, Share2, Copy, Check, Image as ImageIcon, AlertCircle, RefreshCw, Printer, Zap, Bluetooth, Upload, RotateCcw } from 'lucide-react';
import { toPng, toBlob, toCanvas } from 'html-to-image';
import QRCode from 'qrcode';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, StoreSettings, Product } from '../types';

interface MiniTicketModalProps {
  order: Order | null;
  settings: StoreSettings;
  products: Product[];
  lang: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  onUpdateSettings?: (newSettings: StoreSettings) => Promise<void> | void;
}

// Convert HTML Canvas to ESC/POS 1-bit raster graphics binary data
function canvasToEscPosRaster(
  canvas: HTMLCanvasElement,
  darknessThreshold = 185,
  feedLines = 18
): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  // Force thermal width to 384 dots (standard 58mm thermal printer width = 48 bytes per line)
  const targetWidth = 384;
  const scale = targetWidth / canvas.width;
  const targetHeight = Math.round(canvas.height * scale);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = targetWidth;
  tempCanvas.height = targetHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return new Uint8Array();

  tempCtx.fillStyle = '#ffffff';
  tempCtx.fillRect(0, 0, targetWidth, targetHeight);
  tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  const imageData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;

  const bytesPerLine = 48; // 384 / 8
  const rasterData = new Uint8Array(bytesPerLine * targetHeight);

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const alpha = data[idx + 3];

      // Binarize pixel: dark if alpha > 120 and grayscale brightness < darknessThreshold
      const brightness = r * 0.299 + g * 0.587 + b * 0.114;
      const isBlack = alpha > 120 && brightness < darknessThreshold;

      if (isBlack) {
        const byteIdx = y * bytesPerLine + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        rasterData[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  // ESC/POS GS v 0 raster print header: 0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH
  const xL = bytesPerLine & 0xff;
  const xH = (bytesPerLine >> 8) & 0xff;
  const yL = targetHeight & 0xff;
  const yH = (targetHeight >> 8) & 0xff;

  const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  const initCmd = new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x01]); // Reset & Center
  
  // Safe clean paper feed (without GS V cut command 0x1d 0x56 0x00 which causes firmware corruption/garbage print on 58mm portable printers)
  const safeFeed = Math.min(Math.max(feedLines, 3), 15);
  const feedCmd = new Uint8Array([
    0x1b, 0x64, safeFeed, // ESC d n (feed n lines cleanly)
    0x0a, 0x0a             // Clean line break
  ]);

  const totalLength = initCmd.length + header.length + rasterData.length + feedCmd.length;
  const result = new Uint8Array(totalLength);

  let offset = 0;
  result.set(initCmd, offset); offset += initCmd.length;
  result.set(header, offset); offset += header.length;
  result.set(rasterData, offset); offset += rasterData.length;
  result.set(feedCmd, offset);

  return result;
}

export const MiniTicketModal: React.FC<MiniTicketModalProps> = ({
  order,
  settings,
  products,
  lang,
  isOpen,
  onClose,
  onUpdateSettings,
}) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fbQrDataUrl, setFbQrDataUrl] = useState<string>('');
  const [appQrDataUrl, setAppQrDataUrl] = useState<string>('');
  const [monochromeLogoUrl, setMonochromeLogoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPrintingBt, setIsPrintingBt] = useState<boolean>(false);
  const [btStatus, setBtStatus] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Logo upload state from device
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  // CUSTOM PRINT CONTROLS (درجة السواد، حجم الخط، طول الورقة للقص)
  const [darknessThreshold, setDarknessThreshold] = useState<number>(185);
  const [fontSizeScale, setFontSizeScale] = useState<number>(1.0);
  const [feedLines, setFeedLines] = useState<number>(18);
  const [showControls, setShowControls] = useState<boolean>(false);

  const isArabic = lang === 'ar';
  const isRtl = isArabic;
  const currencyStr = isArabic ? (settings.currencyAr || 'دج') : (settings.currencyEn || 'DZD');

  // Handle logo file upload from phone/gallery
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    setUploadSuccessMsg(null);
    setUploadErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/png');

            const updatedSettings: StoreSettings = {
              ...settings,
              logoUrl: compressedBase64,
            };

            // 1. Update localStorage
            localStorage.setItem('local_settings', JSON.stringify(updatedSettings));

            // 2. Update Firestore
            try {
              await setDoc(doc(db, 'settings', 'storeSettings'), { logoUrl: compressedBase64 }, { merge: true });
            } catch (err) {
              console.warn("Firestore logo update skipped or failed, saved locally:", err);
            }

            // 3. Trigger parent state update if available
            if (onUpdateSettings) {
              await onUpdateSettings(updatedSettings);
            }

            setUploadSuccessMsg(isArabic ? '✨ تم حفظ الشعار الجديد بنجاح في الفاتورة والمتجر!' : '✨ New logo saved to ticket and store!');
            setTimeout(() => setUploadSuccessMsg(null), 4000);
          }
        } catch (err) {
          setUploadErrorMsg(isArabic ? '⚠️ حدث خطأ أثناء معالجة الصورة.' : '⚠️ Error processing image.');
        } finally {
          setIsUploadingLogo(false);
        }
      };
      img.onerror = () => {
        setUploadErrorMsg(isArabic ? '⚠️ فشل تحميل صيغة الصورة.' : '⚠️ Failed to parse image.');
        setIsUploadingLogo(false);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setUploadErrorMsg(isArabic ? '⚠️ فشل قراءة الملف من الجهاز.' : '⚠️ Failed to read image file.');
      setIsUploadingLogo(false);
    };
    reader.readAsDataURL(file);
  };

  // Reset to default logo (/logo.jpg)
  const handleResetDefaultLogo = async () => {
    setIsUploadingLogo(true);
    setUploadSuccessMsg(null);
    setUploadErrorMsg(null);
    try {
      const defaultLogo = '/logo.jpg';
      const updatedSettings: StoreSettings = {
        ...settings,
        logoUrl: defaultLogo,
      };
      localStorage.setItem('local_settings', JSON.stringify(updatedSettings));
      try {
        await setDoc(doc(db, 'settings', 'storeSettings'), { logoUrl: defaultLogo }, { merge: true });
      } catch (err) {
        console.warn('Firestore update error:', err);
      }
      if (onUpdateSettings) {
        await onUpdateSettings(updatedSettings);
      }
      setUploadSuccessMsg(isArabic ? '🔄 تم الاسترجاع للشعار الافتراضي بنجاح' : '🔄 Reset to default logo');
      setTimeout(() => setUploadSuccessMsg(null), 4000);
    } catch (err) {
      setUploadErrorMsg(isArabic ? '⚠️ فشل إعادة الشعار الافتراضي' : '⚠️ Reset failed');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Convert logo into monochrome thermal printer format
  useEffect(() => {
    const logoToUse = settings.logoUrl || '/logo.jpg';
    if (!logoToUse) {
      setMonochromeLogoUrl(null);
      return;
    }

    let isMounted = true;
    const img = new Image();
    if (logoToUse.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = 260; // High resolution for thermal printing
        canvas.width = size;
        canvas.height = size;

        const centerX = size / 2;
        const centerY = size / 2;

        // 1. Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // 2. Draw logo image centered on canvas (full size with padding)
        const aspect = img.width / img.height;
        const padding = 10;
        const maxDim = size - padding * 2;
        let drawW = maxDim;
        let drawH = maxDim;

        if (aspect > 1) {
          drawH = maxDim / aspect;
        } else {
          drawW = maxDim * aspect;
        }

        const offsetX = centerX - drawW / 2;
        const offsetY = centerY - drawH / 2;

        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        // 3. Binarize pixels to sharp black/white for thermal printing
        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;

        // Detect if original image background is dark (e.g. black background logo)
        let totalCenterBrightness = 0;
        let sampledCount = 0;
        for (let py = Math.floor(centerY - 20); py <= Math.floor(centerY + 20); py += 5) {
          for (let px = Math.floor(centerX - 20); px <= Math.floor(centerX + 20); px += 5) {
            const idx = (py * size + px) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            totalCenterBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
            sampledCount++;
          }
        }
        // Corner sample
        const cornerIdx = 0;
        const cornerBrightness = 0.299 * data[cornerIdx] + 0.587 * data[cornerIdx + 1] + 0.114 * data[cornerIdx + 2];
        const isDarkBackground = cornerBrightness < 100 || (totalCenterBrightness / sampledCount) < 90;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const alpha = data[i + 3];

          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          let isDarkPixel = false;
          if (isDarkBackground) {
            // If background is dark, bright pixels (white text/icons) become black ink
            isDarkPixel = alpha > 80 && brightness > (255 - darknessThreshold);
          } else {
            // Standard light background, dark pixels become black ink
            isDarkPixel = alpha > 80 && brightness < darknessThreshold;
          }
          const val = isDarkPixel ? 0 : 255;

          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
          data[i + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);

        if (isMounted) {
          setMonochromeLogoUrl(canvas.toDataURL('image/png'));
        }
      } catch (e) {
        if (isMounted) setMonochromeLogoUrl(logoToUse);
      }
    };
    img.onerror = () => {
      if (isMounted) setMonochromeLogoUrl(logoToUse);
    };
    img.src = logoToUse;

    return () => { isMounted = false; };
  }, [settings.logoUrl, darknessThreshold]);

  // Generate QR Codes on order/modal open
  useEffect(() => {
    if (!isOpen || !order) return;

    let isMounted = true;
    const generateQrs = async () => {
      const facebookUrl = 'https://www.facebook.com/share/191AY6Qxsh/';
      const appUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : facebookUrl;

      try {
        const [fbQr, appQr] = await Promise.all([
          QRCode.toDataURL(facebookUrl, {
            margin: 1,
            width: 160,
            color: { dark: '#000000', light: '#ffffff' }
          }),
          QRCode.toDataURL(appUrl, {
            margin: 1,
            width: 160,
            color: { dark: '#000000', light: '#ffffff' }
          })
        ]);

        if (isMounted) {
          setFbQrDataUrl(fbQr);
          setAppQrDataUrl(appQr);
        }
      } catch (err) {
        console.error('Failed to generate QR codes for Mini Ticket image', err);
      }
    };

    generateQrs();
    return () => { isMounted = false; };
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  // Format date and time explicitly into 2 distinct LTR clean lines
  const formatDateTimeParts = (dateInput?: string) => {
    let dateObj: Date | null = null;

    if (!dateInput) {
      dateObj = new Date();
    } else {
      const parsed = new Date(dateInput);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    }

    if (dateObj) {
      const year = dateObj.getFullYear().toString();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const day = dateObj.getDate().toString().padStart(2, '0');
      const hours = dateObj.getHours().toString().padStart(2, '0');
      const minutes = dateObj.getMinutes().toString().padStart(2, '0');
      const seconds = dateObj.getSeconds().toString().padStart(2, '0');

      return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${hours}:${minutes}:${seconds}`
      };
    }

    // Fallback: parse Arabic text e.g. "25 يوليو 2026 في 01:58 م"
    try {
      let s = (dateInput || '').replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit).toString());
      const monthsMap: { [key: string]: string } = {
        'يناير': '01', 'فبراير': '02', 'مارس': '03', 'أبريل': '04', 'مايو': '05', 'يونيو': '06',
        'يوليو': '07', 'أغسطس': '08', 'سبتمبر': '09', 'أكتوبر': '10', 'نوفمبر': '11', 'ديسمبر': '12'
      };

      let monthStr = '01';
      for (const [mName, mNum] of Object.entries(monthsMap)) {
        if (s.includes(mName)) { monthStr = mNum; break; }
      }

      const isPM = s.includes('م') || s.toLowerCase().includes('pm');
      const isAM = s.includes('ص') || s.toLowerCase().includes('am');

      const numbers = s.match(/\d+/g);
      if (numbers && numbers.length >= 3) {
        let day = parseInt(numbers[0], 10);
        let year = parseInt(numbers[1], 10);
        if (day > 31 && year <= 31) { const tmp = day; day = year; year = tmp; }
        else if (numbers.length >= 4 && parseInt(numbers[2], 10) > 2000) { year = parseInt(numbers[2], 10); }

        let hour = numbers.length >= 4 ? parseInt(numbers[numbers.length - 2], 10) : 0;
        let min = numbers.length >= 4 ? parseInt(numbers[numbers.length - 1], 10) : 0;

        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;

        return {
          dateStr: `${year}-${monthStr}-${day.toString().padStart(2, '0')}`,
          timeStr: `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`
        };
      }
    } catch (err) {}

    return { dateStr: dateInput || '', timeStr: '' };
  };

  const { dateStr, timeStr } = formatDateTimeParts(order.date);
  const orderShortId = order.id.slice(0, 8).toUpperCase();

  // DIRECT BLUETOOTH PRINTING (ESC/POS Raster Bitmap)
  const handleDirectBluetoothPrint = async () => {
    if (!ticketRef.current) return;
    setIsPrintingBt(true);
    setShareError(null);

    // Check Web Bluetooth support
    const navBt = (navigator as any).bluetooth;
    if (!navBt) {
      setBtStatus(
        isArabic 
          ? '⚠️ متصفحك لا يدعم Web Bluetooth المباشر. استخدم متصفح Google Chrome على الأندرويد أو الكمبيوتر للطباعة المباشرة عبر البلوتوث.' 
          : 'Web Bluetooth is not supported in this browser. Please use Google Chrome.'
      );
      setIsPrintingBt(false);
      return;
    }

    setBtStatus(isArabic ? '⏳ جاري تحضير التيكيت واقتران طابعة البلوتوث...' : 'Preparing ticket image & requesting Bluetooth printer...');

    try {
      await new Promise((r) => setTimeout(r, 100));

      // Render the ticket DOM element to HTML Canvas
      const canvas = await toCanvas(ticketRef.current, {
        cacheBust: true,
        pixelRatio: 1.5,
        backgroundColor: '#ffffff'
      });

      // Convert Canvas to ESC/POS 1-bit raster graphics binary data
      const escPosBytes = canvasToEscPosRaster(canvas, darknessThreshold, feedLines);

      setBtStatus(isArabic ? '🔍 اختر طابعة البلوتوث من قائمة الأجهزة المتاحة...' : 'Select your Bluetooth printer...');

      const device = await navBt.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '00001101-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000ae01-0000-1000-8000-00805f9b34fb',
          '0000af00-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455'
        ]
      });

      setBtStatus(isArabic ? `⏳ جاري الاتصال بطابعة البلوتوث: [${device.name || 'Thermal Printer'}]...` : 'Connecting to printer...');

      const server = await device.gatt?.connect();
      if (!server) throw new Error('GATT Server connection failed');

      let targetChar: any = null;
      const services = await server.getPrimaryServices();

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              targetChar = char;
              break;
            }
          }
        } catch (e) {}
        if (targetChar) break;
      }

      if (!targetChar) {
        throw new Error('No writable Bluetooth characteristic found on printer');
      }

      setBtStatus(isArabic ? '🖨️ جاري إرسال البيانات بسرعة وبشكل متواصل للطابعة...' : 'Sending continuous ESC/POS raster data to printer...');

      // Send binary data in smooth continuous chunks
      const chunkSize = 128;
      let sentBytes = 0;

      for (let offset = 0; offset < escPosBytes.length; offset += chunkSize) {
        const chunk = escPosBytes.slice(offset, offset + chunkSize);
        
        try {
          if (targetChar.properties.writeWithoutResponse) {
            await targetChar.writeValueWithoutResponse(chunk);
          } else {
            await targetChar.writeValue(chunk);
          }
        } catch (writeErr) {
          for (let subOffset = 0; subOffset < chunk.length; subOffset += 32) {
            const subChunk = chunk.slice(subOffset, subOffset + 32);
            try {
              if (targetChar.properties.writeWithoutResponse) {
                await targetChar.writeValueWithoutResponse(subChunk);
              } else {
                await targetChar.writeValue(subChunk);
              }
            } catch (e) {
              await targetChar.writeValue(subChunk);
            }
            await new Promise((r) => setTimeout(r, 2));
          }
        }

        sentBytes += chunk.length;
        const progress = Math.round((sentBytes / escPosBytes.length) * 100);
        setBtStatus(isArabic ? `🖨️ جاري الطباعة السريعة (${progress}%)...` : `Printing (${progress}%)...`);

        await new Promise((r) => setTimeout(r, 2));
      }

      setBtStatus(isArabic ? '🎉 تم إرسال الفاتورة بنجاح وتخرج الورقة بالكامل للقص!' : 'Printed successfully!');
    } catch (err: any) {
      console.error('Direct Bluetooth Thermal Print error:', err);
      if (err.name === 'NotFoundError') {
        setBtStatus(isArabic ? '💡 تم إلغاء نافذة اختيار طابعة البلوتوث.' : 'Bluetooth selection cancelled.');
      } else {
        setBtStatus(
          isArabic 
            ? '⚠️ فشل الاقتران أو إرسال البيانات للطابعة. تأكد من تشغيل الطابعة والبلوتوث في الهاتف، أو استخدم زر [مشاركة الصورة 📲].' 
            : 'Bluetooth print failed. Ensure printer is powered on and paired.'
        );
      }
    } finally {
      setIsPrintingBt(false);
    }
  };

  // Function to capture and download PNG image
  const handleDownloadPng = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    setShareError(null);

    try {
      await new Promise((r) => setTimeout(r, 150));

      const dataUrl = await toPng(ticketRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      const link = document.createElement('a');
      link.download = `ticket-${orderShortId}.png`;
      link.href = dataUrl;
      link.click();

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Error generating ticket image PNG:', err);
      setShareError(isArabic ? 'حدث خطأ أثناء إنشاء صورة التيكيت' : 'Failed to generate ticket image');
    } finally {
      setIsGenerating(false);
    }
  };

  // Function to share PNG image via Web Share API
  const handleSharePng = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    setShareError(null);

    try {
      await new Promise((r) => setTimeout(r, 150));

      const blob = await toBlob(ticketRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      if (!blob) throw new Error('Blob generation failed');

      const fileName = `ticket-${orderShortId}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Ticket #${orderShortId}`,
          text: isArabic ? `تيكيت طلب رقم #${orderShortId}` : `Order Ticket #${orderShortId}`
        });
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3000);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing ticket image:', err);
        handleDownloadPng();
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Function to copy image to clipboard
  const handleCopyImage = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    setShareError(null);

    try {
      await new Promise((r) => setTimeout(r, 150));

      const blob = await toBlob(ticketRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      if (!blob) throw new Error('Blob generation failed');

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 3000);
      } else {
        handleDownloadPng();
      }
    } catch (err) {
      console.error('Copy image failed, falling back to download:', err);
      handleDownloadPng();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden animate-slide-up flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Zap className="w-5 h-5 fill-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {isArabic ? 'طباعة حرارية فورية 🖨️' : 'Direct Thermal Image Print'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isArabic ? `طلب رقم: #${orderShortId}` : `Order: #${orderShortId}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content / Preview Area */}
        <div className="p-4 overflow-y-auto bg-slate-100/70 space-y-3.5 flex flex-col items-center">
          
          {/* PRINT CSS STYLES FOR DIRECT 58mm THERMAL PRINTING */}
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #mini-thermal-ticket-printable, #mini-thermal-ticket-printable * {
                visibility: visible !important;
              }
              #mini-thermal-ticket-printable {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 58mm !important;
                max-width: 58mm !important;
                padding: 1.5mm !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: #ffffff !important;
                color: #000000 !important;
              }
              @page {
                size: 58mm auto;
                margin: 0;
              }
            }
          `}</style>

          {/* PRIMARY DIRECT INSTANT PRINT BUTTON */}
          <div className="w-full">
            <button
              type="button"
              onClick={handleDirectBluetoothPrint}
              disabled={isPrintingBt}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2.5 transition shadow-lg shadow-blue-500/20 cursor-pointer disabled:opacity-60 border border-blue-400/30"
            >
              {isPrintingBt ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-300" />
                  <span>{isArabic ? 'جاري الاقتران والطباعة المباشرة...' : 'Pairing & Direct Printing...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300 animate-pulse" />
                  <span>{isArabic ? '⚡ طباعة مباشرة عبر البلوتوث (Mini Printer)' : '⚡ Direct Bluetooth Printing (Mini Printer)'}</span>
                </>
              )}
            </button>
          </div>

          {/* PRINT CONTROLS TOGGLE BUTTON (التحكم بالسواد والخطوط والخروج) */}
          <div className="w-full">
            <button
              type="button"
              onClick={() => setShowControls(!showControls)}
              className="w-full py-2 px-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-between transition hover:bg-slate-50 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span>⚙️</span>
                <span>{isArabic ? 'إعدادات الوضوح، السواد وحجم الخط' : 'Clarity, Darkness & Font Settings'}</span>
              </span>
              <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">
                {showControls ? (isArabic ? 'إخفاء ▲' : 'Hide ▲') : (isArabic ? 'تعديل ▼' : 'Edit ▼')}
              </span>
            </button>

            {/* EXPANDABLE CONTROLS PANEL */}
            {showControls && (
              <div className="mt-2.5 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3.5 text-xs text-slate-800 animate-fade-in">
                {/* 1. DARKNESS / THRESHOLD SLIDER */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>{isArabic ? 'درجة سواد الحبر (الوضوح):' : 'Ink Darkness / Contrast:'}</span>
                    <span className="text-blue-600 font-mono">{darknessThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="120"
                    max="230"
                    value={darknessThreshold}
                    onChange={(e) => setDarknessThreshold(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>{isArabic ? 'فاتح' : 'Light'}</span>
                    <span>{isArabic ? 'عادي (185)' : 'Normal (185)'}</span>
                    <span>{isArabic ? 'داكن جداً' : 'Very Dark'}</span>
                  </div>
                </div>

                {/* 2. FONT SIZE SCALE */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>{isArabic ? 'حجم الخط والتكبير:' : 'Font Size Scale:'}</span>
                    <span className="text-blue-600 font-mono">{Math.round(fontSizeScale * 100)}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-1">
                    {[
                      { label: isArabic ? 'صغير' : 'Small', val: 0.85 },
                      { label: isArabic ? 'عادي' : 'Normal', val: 1.0 },
                      { label: isArabic ? 'كبير' : 'Large', val: 1.15 },
                      { label: isArabic ? 'ضخم' : 'X-Large', val: 1.25 },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        onClick={() => setFontSizeScale(btn.val)}
                        className={`py-1.5 px-2 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                          fontSizeScale === btn.val
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. PAPER FEED MARGIN (LENGTH BEFORE CUT) */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>{isArabic ? 'مسافة خروج الورقة للقص:' : 'Paper Feed Before Cut:'}</span>
                    <span className="text-blue-600 font-mono">{feedLines} {isArabic ? 'أسطر' : 'lines'}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="28"
                    value={feedLines}
                    onChange={(e) => setFeedLines(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {isArabic
                      ? '💡 زِد هذه القيمة إذا بقيت الفاتورة محتجزة داخل الطابعة لتخرج بالكامل أمام شفرة القص.'
                      : 'Increase this value if the ticket stays stuck inside the printer before cutting.'}
                  </p>
                </div>

                {/* 4. LOGO UPLOAD & CUSTOMIZATION CONTROL FOR TICKETS */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-slate-800 flex items-center gap-1.5 text-xs">
                      <Upload className="w-3.5 h-3.5 text-amber-600" />
                      <span>{isArabic ? 'تغيير صورة اللوغو في الفاتورة والتيكيت:' : 'Change Receipt Logo Image:'}</span>
                    </span>
                    {settings.logoUrl && settings.logoUrl !== '/logo.jpg' && (
                      <button
                        type="button"
                        onClick={handleResetDefaultLogo}
                        disabled={isUploadingLogo}
                        className="text-[10px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{isArabic ? 'الأصلي' : 'Reset'}</span>
                      </button>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoFileUpload}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 active:scale-[0.99] border border-amber-200/80 text-amber-900 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingLogo ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                        <span>{isArabic ? 'جاري رفع ومعالجة الشعار...' : 'Uploading logo...'}</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4 text-amber-600" />
                        <span>{isArabic ? '📷 رفع وتغيير اللوغو من الهاتف' : '📷 Upload Logo from Phone'}</span>
                      </>
                    )}
                  </button>

                  {uploadSuccessMsg && (
                    <div className="mt-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl text-center animate-fade-in">
                      {uploadSuccessMsg}
                    </div>
                  )}

                  {uploadErrorMsg && (
                    <div className="mt-1.5 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl text-center animate-fade-in">
                      {uploadErrorMsg}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bluetooth Direct Print / Pairing Status Message */}
          {btStatus && (
            <div className="w-full bg-blue-50 border border-blue-200 text-blue-950 text-xs p-3 rounded-2xl font-semibold leading-relaxed animate-fade-in shadow-2xs">
              {btStatus}
            </div>
          )}

          {shareError && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{shareError}</span>
            </div>
          )}

          {/* THE TICKET ELEMENT TO BE CAPTURED AS IMAGE / SENT TO THERMAL PRINTER */}
          <div className="w-full flex justify-center py-1">
            <div
              ref={ticketRef}
              id="mini-thermal-ticket-printable"
              style={{
                width: '320px',
                backgroundColor: '#ffffff',
                color: '#000000',
                paddingTop: '12px',
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingBottom: '12px',
                boxSizing: 'border-box',
                fontFamily: "'Courier New', Courier, monospace, sans-serif",
                direction: isRtl ? 'rtl' : 'ltr',
                border: '2px solid #000000',
                borderRadius: '6px',
              }}
            >
              {/* 1. TOP HEADER: STAMP LOGO ON THE RIGHT + CENTERED DATE & TIME */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', color: '#000000' }}>
                {/* Logo Stamp (ختم المحل في الأعلى على اليمين) */}
                {(monochromeLogoUrl || settings.logoUrl || '/logo.jpg') && (
                  <div style={{ width: '70px', height: '70px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={monochromeLogoUrl || settings.logoUrl || '/logo.jpg'}
                      alt="Logo Stamp"
                      style={{ width: '68px', height: '68px', objectFit: 'contain', display: 'block', imageRendering: 'pixelated' }}
                    />
                  </div>
                )}

                {/* Date & Time (بتنسيق LTR واضح) */}
                <div dir="ltr" style={{ flex: 1, textAlign: 'center', color: '#000000', fontFamily: 'Courier, monospace', fontWeight: '900', unicodeBidi: 'isolate' }}>
                  <div style={{ fontSize: `${Math.round(18 * fontSizeScale)}px`, letterSpacing: '1px' }}>
                    {dateStr}
                  </div>
                  {timeStr && (
                    <div style={{ fontSize: `${Math.round(17 * fontSizeScale)}px`, letterSpacing: '1px', marginTop: '2px' }}>
                      {timeStr}
                    </div>
                  )}
                </div>
              </div>

              {/* DASHED SEPARATOR */}
              <div style={{ borderTop: '2px dashed #000000', margin: '8px 0' }}></div>

              {/* 2. PRODUCT DETAILS (PRODUCT NAME, QUANTITY, PRICE ON SEPARATE LINES) */}
              <div style={{ width: '100%', color: '#000000', fontSize: `${Math.round(17 * fontSizeScale)}px`, fontWeight: '900', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {order.items.map((item, idx) => {
                  const rawTitle = isArabic ? item.titleAr : item.titleEn;
                  // Strip all brackets [] () {} and their inner text from product name
                  const itemTitle = (rawTitle || '')
                    .replace(/\[.*?\]/g, '')
                    .replace(/\(.*?\)/g, '')
                    .replace(/\{.*?\}/g, '')
                    .trim();

                  const itemQty = item.customWeightText ? item.customWeightText : `${item.quantity} ${isArabic ? 'كلغ' : 'kg'}`;
                  const itemPrice = item.price ? `${item.price}` : `${order.total}`;

                  return (
                    <div key={idx} style={{ marginBottom: '6px' }}>
                      {/* Product Name strictly in a single line */}
                      <div style={{ lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        <span>{isArabic ? 'المنتج : ' : 'Product: '}</span>
                        <span style={{ fontWeight: '900', fontSize: `${Math.round(18 * fontSizeScale)}px` }}>{itemTitle}</span>
                      </div>
                      
                      {/* Quantity on separate line */}
                      <div style={{ marginTop: '3px' }}>
                        <span>{isArabic ? 'الكمية : ' : 'Qty: '}</span>
                        <span style={{ fontWeight: '900' }}>{itemQty}</span>
                      </div>

                      {/* Price on separate line */}
                      <div style={{ marginTop: '3px' }}>
                        <span>{isArabic ? 'الثمن : ' : 'Price: '}</span>
                        <span style={{ fontWeight: '900', fontSize: `${Math.round(19 * fontSizeScale)}px` }}>{itemPrice} {currencyStr}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Customer Phone if provided */}
                {order.customerPhone && (
                  <div style={{ marginTop: '2px' }}>
                    <span>{isArabic ? 'رقم : ' : 'Phone: '}</span>
                    <span dir="ltr" style={{ fontWeight: '900', fontSize: `${Math.round(18 * fontSizeScale)}px`, unicodeBidi: 'isolate' }}>{order.customerPhone}</span>
                  </div>
                )}

                {/* Customer Address if provided */}
                {order.customerAddress && (
                  <div style={{ marginTop: '2px' }}>
                    <span>{isArabic ? 'العنوان : ' : 'Address: '}</span>
                    <span style={{ fontWeight: '900', fontSize: `${Math.round(16 * fontSizeScale)}px` }}>{order.customerAddress}</span>
                  </div>
                )}
              </div>

              {/* DASHED SEPARATOR */}
              <div style={{ borderTop: '2px dashed #000000', margin: '8px 0' }}></div>

              {/* 4. QR CODES SECTION */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '6px' }}>
                {appQrDataUrl && (
                  <div style={{ flex: 1, border: '1.5px solid #000000', padding: '5px 3px', textAlign: 'center', background: '#ffffff' }}>
                    <img src={appQrDataUrl} alt="Store QR" style={{ width: '85px', height: '85px', margin: '0 auto', display: 'block' }} />
                    <div style={{ fontSize: `${Math.round(12 * fontSizeScale)}px`, fontWeight: '900', marginTop: '4px', color: '#000000' }}>
                      {isArabic ? 'لطلب من الموقع' : 'Order Online'}
                    </div>
                  </div>
                )}

                {fbQrDataUrl && (
                  <div style={{ flex: 1, border: '1.5px solid #000000', padding: '5px 3px', textAlign: 'center', background: '#ffffff' }}>
                    <img src={fbQrDataUrl} alt="FB QR" style={{ width: '85px', height: '85px', margin: '0 auto', display: 'block' }} />
                    <div style={{ fontSize: `${Math.round(12 * fontSizeScale)}px`, fontWeight: '900', marginTop: '4px', color: '#000000' }}>
                      {isArabic ? 'fb المتابعة على' : 'Follow on FB'}
                    </div>
                  </div>
                )}
              </div>

              {/* DASHED SEPARATOR */}
              <div style={{ borderTop: '2px dashed #000000', margin: '10px 0 6px 0' }}></div>

              {/* 5. BOTTOM SECTION: STORE PHONE & ORDER ID */}
              <div style={{ textAlign: 'center', color: '#000000', width: '100%', fontSize: `${Math.round(17 * fontSizeScale)}px`, fontWeight: '900' }}>
                {settings.ownerPhone && (
                  <div style={{ margin: '2px 0' }}>
                    <span>{isArabic ? 'رقم المحل : ' : 'Store Tel: '}</span>
                    <span dir="ltr" style={{ fontWeight: '900', fontSize: `${Math.round(18 * fontSizeScale)}px`, unicodeBidi: 'isolate' }}>{settings.ownerPhone}</span>
                  </div>
                )}
                <div style={{ margin: '2px 0' }}>
                  <span>{isArabic ? 'رقم الطلب : ' : 'Order ID: '}</span>
                  <span style={{ fontWeight: '900', fontSize: `${Math.round(19 * fontSizeScale)}px` }}>#{orderShortId}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-2.5 shrink-0">
          
          {/* Main Download PNG Button */}
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isGenerating}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md cursor-pointer disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isArabic ? 'جاري تحضير صورة PNG...' : 'Generating Image...'}</span>
              </>
            ) : downloadSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span>{isArabic ? 'تم حفظ صورة التيكيت بنجاح! 🎉' : 'Ticket Image Saved! 🎉'}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{isArabic ? '📥 حفظ التيكيت كصورة (PNG)' : '📥 Save Ticket Image (PNG)'}</span>
              </>
            )}
          </button>

          {/* Secondary Action Buttons (Share & Copy) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSharePng}
              disabled={isGenerating}
              className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-60"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{isArabic ? '📲 مشاركة الصورة' : '📲 Share Image'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyImage}
              disabled={isGenerating}
              className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60"
            >
              {copiedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isArabic ? 'تم نسخ الصورة!' : 'Copied!'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isArabic ? '📋 نسخ الصورة' : '📋 Copy Image'}</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
