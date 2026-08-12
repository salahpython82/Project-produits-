import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product, Language } from '../types';
import { translations } from '../data/translations';
import { BarcodeSVG } from './BarcodeSVG';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
  products: Product[];
  lang: Language;
}

export const playPOSBeepSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, audioCtx.currentTime); // standard crisp scanner beep
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.085); // elegant 85ms beep
  } catch (e) {
    console.warn('Web Audio beep was blocked or not supported by browser:', e);
  }
};

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  products,
  lang,
}) => {
  const dict = translations[lang];
  const isRtl = lang === 'ar';
  
  const [activeTab, setActiveTab] = useState<'camera' | 'usb' | 'simulator'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerStarted, setScannerStarted] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string>('');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const isScannerShouldBeRunningRef = useRef(false);
  const startTimeoutRef = useRef<any>(null);

  // Focus USB helper textbox when switching to USB tab
  useEffect(() => {
    if (activeTab === 'usb' && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [activeTab]);

  // Clean and control camera scanning lifecycles
  useEffect(() => {
    if (!isOpen) {
      isScannerShouldBeRunningRef.current = false;
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      stopCameraScanner();
      return;
    }

    if (activeTab === 'camera') {
      isScannerShouldBeRunningRef.current = true;
      startCameraScanner();
    } else {
      isScannerShouldBeRunningRef.current = false;
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      stopCameraScanner();
    }

    return () => {
      isScannerShouldBeRunningRef.current = false;
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      stopCameraScanner();
    };
  }, [isOpen, activeTab]);

  const startCameraScanner = async () => {
    setCameraError(null);
    setScanningStatus(isRtl ? 'جاري تشغيل عدسة الكاميرا...' : 'Starting camera lens stream...');
    
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
    }

    // Slight delay to ensure the DOM element #scanner-element is rendered and mounted
    startTimeoutRef.current = setTimeout(async () => {
      if (!isScannerShouldBeRunningRef.current) {
        return;
      }

      try {
        const scannerElement = document.getElementById('camera-scanner-view');
        if (!scannerElement) return;

        // Create scanner instance if not exists
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode('camera-scanner-view');
        }

        const scanner = scannerRef.current;

        // Switch guard if already scanning to prevent transition errors
        if (scanner.isScanning) {
          setScannerStarted(true);
          setScanningStatus(isRtl ? 'امسح الباركود الآن' : 'Scanning active - present barcode');
          return;
        }

        await scanner.start(
          { facingMode: 'environment' }, // request rear camera if mobile
          {
            fps: 15,
            qrbox: (width, height) => {
              // Wide landscape scanning box for 1D barcodes
              const boxWidth = Math.min(width * 0.85, 380);
              const boxHeight = Math.min(height * 0.4, 150);
              return { width: boxWidth, height: boxHeight };
            },
            aspectRatio: 1.777778, // 16:9 widescreen
          },
          (decodedText) => {
            // success callback
            handleScannedCode(decodedText);
          },
          (errorMessage) => {
            // Silent ignore frame failures - it fails constantly until a clear barcode is detected
          }
        );

        // Double check if scanner was closed/changed while starting
        if (!isScannerShouldBeRunningRef.current) {
          await stopCameraScanner();
          return;
        }

        setScannerStarted(true);
        setScanningStatus(isRtl ? 'امسح الباركود الآن' : 'Scanning active - present barcode');
      } catch (err: any) {
        console.error('Camera Scanner start error:', err);
        if (isScannerShouldBeRunningRef.current) {
          setCameraError(
            isRtl 
              ? 'تعذر رصد الكاميرا أو إذن الوصول مرفوض. نوصي باستخدام المحاكاة أو قارئ USB.' 
              : 'Could not access the device camera. We recommend trying the Simulator or USB Reader instead.'
          );
        }
        setScannerStarted(false);
      }
    }, 400);
  };

  const stopCameraScanner = async () => {
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }

    if (scannerRef.current) {
      const scanner = scannerRef.current;
      if (scanner.isScanning) {
        try {
          await scanner.stop();
        } catch (e) {
          console.warn('Silent warning: Camera scanner stop error handled gracefully:', e);
        }
      }
    }
    setScannerStarted(false);
  };

  const handleScannedCode = (code: string) => {
    const cleanedCode = code.trim();
    if (!cleanedCode) return;

    playPOSBeepSound();
    onScanSuccess(cleanedCode);
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScannedCode(manualCode);
      setManualCode('');
    }
  };

  // Products with actual assigned barcodes to display in the simulator
  const activeProductsWithBarcodes = products.filter(p => p.barcode && p.barcode.trim().length > 0);

  if (!isOpen) return null;

  return (
    <div id="barcode-scanner-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in">
      <div id="barcode-scanner-modal-card" className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-slate-900 text-white rounded-xl text-lg">💡</span>
            <div>
              <h3 className="font-sans font-bold text-slate-800 text-base">
                {dict.barcodeScanner}
              </h3>
              <p className="text-xs text-slate-400 font-mono">1D Code-39 / EAN Decoder</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-sm font-semibold transition"
          >
            ✕
          </button>
        </div>

        {/* View Selection Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/30 p-2 gap-1.5">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'camera'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            📷 {isRtl ? 'مسح بالكاميرا' : 'Camera Scan'}
          </button>
          <button
            onClick={() => setActiveTab('usb')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'usb'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            🔌 {isRtl ? 'قارئ USB / كتابة' : 'USB Reader / Input'}
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'simulator'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            📋 {isRtl ? 'محاكي المسح' : 'Scan Simulator'}
          </button>
        </div>

        {/* Dynamic content tab viewports */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[280px]">
          
          {/* CAMERA TAB */}
          {activeTab === 'camera' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              {cameraError ? (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs leading-relaxed max-w-md text-center">
                  <div className="text-xl mb-1.5">⚠️</div>
                  {cameraError}
                </div>
              ) : (
                <div className="w-full max-w-sm flex flex-col items-center">
                  <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 bg-slate-950 relative flex items-center justify-center">
                    
                    {/* Main target visual frame */}
                    <div id="camera-scanner-view" className="absolute inset-0 w-full h-full" />
                    
                    {/* Overlay target guidelines */}
                    <div className="absolute inset-x-6 h-[70px] border-2 border-red-500 rounded-lg pointer-events-none z-10 flex items-center justify-center bg-red-400/5 animate-pulse">
                      <div className="w-full h-0.5 bg-red-500 absolute" />
                    </div>
                    
                    {/* Status badge */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-slate-900/80 backdrop-blur-xs text-[10px] text-white font-semibold rounded-full z-10">
                      {scanningStatus}
                    </div>
                  </div>
                  
                  <p className="text-slate-400 text-center text-[11px] mt-4 max-w-[280px]">
                    {dict.scannerCameraTip}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* USB / MANUAL TAB */}
          {activeTab === 'usb' && (
            <div className="flex flex-col space-y-5">
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-blue-800 text-[11px] leading-relaxed">
                ℹ️ {isRtl 
                  ? 'إذا كان لديك مسدس ليزر باركود سلكي أو لاسلكي، قم بتركيز المؤشر في الأسفل وقم بالمسح مباشرة، وسيسجل التطبيق الكود فوراً بمجرد تأكيد القارئ.' 
                  : 'If you have a physical USB/wireless barcode scanner, keep the cursor focused on the box below. Scanners automatically press Enter to insert instantly.'
                }
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {dict.barcodeLabel} / {isRtl ? 'إدخال يدوي أو بالمسدس تلقائياً' : 'Laser Gun Code input'}
                  </label>
                  <input
                    ref={manualInputRef}
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={dict.barcodePlaceholder}
                    className="w-full p-3 font-mono text-sm border border-slate-200 rounded-xl focus:border-slate-800 focus:outline-hidden text-center bg-slate-50 text-slate-800 tracking-widest"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-850 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl shadow-xs transition"
                >
                  {isRtl ? 'تأكيد وإدخال الكود 🎯' : 'Submit Decoded Code 🎯'}
                </button>
              </form>
            </div>
          )}

          {/* SIMULATOR TAB */}
          {activeTab === 'simulator' && (
            <div className="flex flex-col space-y-4">
              <p className="text-[11px] text-slate-550 leading-relaxed">
                💡 {dict.simulateBarcodeScan}
              </p>

              {activeProductsWithBarcodes.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100 text-slate-400 text-xs">
                  {isRtl 
                    ? 'لم تقم بتعيين باركود لأي منتج بعد! يرجى التوجه إلى لوحة التحكم وتعديل المنتجات وإضافة كود باركود لهم (أو الضغط على توليد تلقائي).'
                    : 'No products have been assigned barcodes yet! Please go to the Admin Dashboard and assign some barcodes first.'
                  }
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                  {activeProductsWithBarcodes.map((prod) => (
                    <button
                      key={prod.id}
                      onClick={() => handleScannedCode(prod.barcode || '')}
                      className="flex items-center gap-3 p-2.5 bg-white border border-slate-100 rounded-xl hover:border-slate-900 transition text-right group text-slate-700 hover:shadow-xs"
                    >
                      <img
                        src={prod.image}
                        alt={prod.titleEn}
                        className="w-10 h-10 object-cover rounded-lg shrink-0 border border-slate-100"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0 flex-1 text-right">
                        <h4 className="font-sans text-xs font-bold leading-tight truncate text-slate-800 group-hover:text-slate-950">
                          {isRtl ? prod.titleAr : prod.titleEn}
                        </h4>
                        <span className="font-mono text-[10px] text-slate-400 tracking-wider font-semibold block mt-1 hover:text-slate-600">
                          {prod.barcode}
                        </span>
                      </div>
                      <span className="shrink-0 text-slate-300 group-hover:text-slate-900 transition-colors text-xs">
                        {isRtl ? 'اضغط للمسح 👆' : 'Tap to scan 👆'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
        </div>

        {/* Footer info/controls */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 font-bold text-xs bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
          >
            {dict.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
