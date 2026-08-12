import React from 'react';
import { X, Smartphone, Bluetooth, CheckCircle2, HelpCircle, Printer, AlertTriangle } from 'lucide-react';

interface PrinterPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const PrinterPairingModal: React.FC<PrinterPairingModalProps> = ({ isOpen, onClose, lang }) => {
  if (!isOpen) return null;

  const isRtl = lang === 'ar';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Bluetooth className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {isRtl ? 'دليل اقتران طابعة الفواتير الحرارية 📱' : 'Bluetooth Thermal Printer Pairing Guide'}
              </h3>
              <p className="text-xs text-slate-500">
                {isRtl ? 'خطوات ربط الطابعة المحمولة (58mm/80mm) بالهاتف أو الكمبيوتر' : 'How to connect your portable POS printer via Bluetooth'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-700">
          
          {/* Notice Box */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed font-medium">
              {isRtl ? (
                <>
                  <b>سبب الشاشة الفارغة أو عدم ظهور الطابعة:</b> يجب أولاً اقتران الطابعة بالبلوتوث في إعدادات الهاتف أو الويندوز حتى يراها المتصفح كطابعة جاهزة للطباعة!
                </>
              ) : (
                <>
                  <b>Prerequisites:</b> You must first pair the Bluetooth printer in your phone or PC Bluetooth settings before your browser can detect it!
                </>
              )}
            </div>
          </div>

          {/* Steps List */}
          <div className="space-y-4">
            
            {/* Step 1 */}
            <div className="flex gap-3 items-start p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">
                  {isRtl ? 'تشغيل الطابعة الحرارية' : 'Turn On Printer'}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isRtl 
                    ? 'ضع الورق الحراري في الطابعة واضغط على زر التشغيل حتى يضيء مؤشر البلوتوث (الأزرق أو الأخضر).'
                    : 'Turn on the printer and verify paper is inserted and Bluetooth status light is blinking.'}
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3 items-start p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Bluetooth className="w-4 h-4 text-blue-600" />
                  <span>{isRtl ? 'الفتح والبحث في البلوتوث' : 'Search Bluetooth Devices'}</span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isRtl
                    ? 'افتح إعدادات البلوتوث في هاتفك ⚙️ -> أجهزة جديدة -> ابحث عن اسم الطابعة (مثل PT-210, MPT-II, POS-58, Xprinter).'
                    : 'Go to Settings -> Bluetooth -> Add New Device, then find your printer name (e.g. PT-210, POS-58, MPT-II).'}
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3 items-start p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/60">
              <div className="w-7 h-7 rounded-xl bg-amber-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                3
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-amber-950 text-sm">
                  {isRtl ? 'إدخال رمز PIN الاقتران الافتراضي' : 'Enter Default Pairing PIN'}
                </h4>
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  {isRtl ? (
                    <>أدخل أحد الرمزين الافتراضيين: <code className="bg-amber-200/80 px-2 py-0.5 rounded font-mono font-bold">0000</code> أو <code className="bg-amber-200/80 px-2 py-0.5 rounded font-mono font-bold">1234</code></>
                  ) : (
                    <>Enter default PIN: <code className="bg-amber-200/80 px-2 py-0.5 rounded font-mono font-bold">0000</code> or <code className="bg-amber-200/80 px-2 py-0.5 rounded font-mono font-bold">1234</code></>
                  )}
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3 items-start p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                4
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-emerald-600" />
                  <span>{isRtl ? 'الطباعة المباشرة من المتصفح' : 'Print directly from Browser'}</span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isRtl
                    ? 'بعد الاقتران، عد للتطبيق واضغط زر "تيكيت ميني 📱". في نافذة الطباعة المنبثقة، اضغط زر "اقتران وطباعة بلوتوث 📶" بالأعلى للاتصال المباشر فوراً!'
                    : 'After pairing, click "Mini Ticket 📱" in the app, then click "Bluetooth Direct Print 📶" at the top of the popup window!'}
                </p>
              </div>
            </div>

          </div>

          {/* Quick tip box for Android Users */}
          <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-150 text-blue-900 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>{isRtl ? 'ملاحظة لهواتف الأندرويد (Android):' : 'Note for Android Users:'}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-blue-800">
              {isRtl
                ? 'إذا لم تظهر الطابعة تلقائياً في قائمة الطباعة بالنظام، يمكنك تحميل تطبيق مجاني مثل (RawBT) أو (ESC/POS Service) من متجر Play لجعل الأندرويد يطبع الفواتير بضغطة زر.'
                : 'If the printer is not auto-detected in System Print, you can use a free helper app like RawBT or ESC/POS Service from Google Play.'}
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm"
          >
            {isRtl ? 'فهمت، شكراً 👍' : 'Got it, Thanks 👍'}
          </button>
        </div>

      </div>
    </div>
  );
};
