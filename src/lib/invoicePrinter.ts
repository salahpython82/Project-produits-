import { Order, StoreSettings, Product } from '../types';
import { getBarcodeSVGString } from './invoiceBarcode';
import QRCode from 'qrcode';

export async function openPrintInvoice({
  order,
  settings,
  products,
  lang,
  initialMode = 'thermal'
}: {
  order: Order;
  settings: StoreSettings;
  products: Product[];
  lang: 'ar' | 'en';
  initialMode?: 'thermal' | 'a4';
}) {
  const isArabic = lang === 'ar';
  const isRtl = isArabic;
  const storeName = isArabic ? (settings.storeNameAr || 'متجرنا الإلكتروني') : (settings.storeNameEn || 'Our Store');
  const ownerName = isArabic ? (settings.ownerNameAr || '') : (settings.ownerNameEn || '');
  const currencyStr = isArabic ? (settings.currencyAr || 'د.ج') : (settings.currencyEn || 'DZD');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert(
      isArabic
        ? '⚠️ الرجاء السماح بالنوافذ المنبثقة من إعدادات المتصفح لطباعة الفاتورة!'
        : '⚠️ Please allow popup windows in browser settings to print invoice!'
    );
    return;
  }

  const barcodeSvg = getBarcodeSVGString(order.id.slice(0, 12).toUpperCase(), 1.3, 40);

  // Generate QR code Data URLs
  const facebookUrl = 'https://www.facebook.com/share/191AY6Qxsh/';
  const appUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : facebookUrl;

  let fbQrDataUrl = '';
  let appQrDataUrl = '';

  try {
    fbQrDataUrl = await QRCode.toDataURL(facebookUrl, {
      margin: 1,
      width: 150,
      color: { dark: '#000000', light: '#ffffff' }
    });
    appQrDataUrl = await QRCode.toDataURL(appUrl, {
      margin: 1,
      width: 150,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (err) {
    console.error('Failed to generate QR codes', err);
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${isArabic ? 'فاتورة طلب' : 'Order Receipt'} - ${order.id}</title>
      <style>
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, system-ui, -apple-system, sans-serif;
          color: #000000;
          background-color: #f1f5f9;
          margin: 0;
          padding: 0;
          direction: ${isRtl ? 'rtl' : 'ltr'};
          font-size: 15px;
          line-height: 1.4;
        }

        /* Top control bar for interactive print options */
        .print-control-bar {
          background: #0f172a;
          color: #ffffff;
          padding: 12px 16px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          position: sticky;
          top: 0;
          z-index: 9999;
          font-family: system-ui, sans-serif;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .btn-control {
          background: #334155;
          color: #ffffff;
          border: 1px solid #475569;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-control:hover {
          background: #475569;
        }

        .btn-control.active {
          background: #2563eb;
          border-color: #3b82f6;
          color: #ffffff;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
        }

        .btn-primary-print {
          background: #059669;
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3);
        }

        .btn-primary-print:hover {
          background: #047857;
        }

        /* Printable Wrapper */
        .page-wrapper {
          padding: 20px 10px;
          display: flex;
          justify-content: center;
        }

        /* MAIN RECEIPT CARD */
        .receipt-card {
          background: #ffffff;
          color: #000000;
          width: 100%;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          border: 2px solid #000000;
          transition: all 0.2s ease;
        }

        /* Thermal Printer specific mode width (58mm / 80mm / WalkPrint) */
        .mode-thermal {
          max-width: 380px; /* Fits 58mm and 80mm thermal rolls perfectly */
          padding: 12px !important;
          border: 2px dashed #000000 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .mode-a4 {
          max-width: 800px;
        }

        /* Font Scaling Classes */
        .font-scale-100 { font-size: 15px; }
        .font-scale-115 { font-size: 17px; }
        .font-scale-130 { font-size: 19.5px; }
        .font-scale-150 { font-size: 22.5px; }

        /* Typography & High-Contrast Elements */
        .store-header {
          text-align: center;
          border-bottom: 2px dashed #000000;
          padding-bottom: 12px;
          margin-bottom: 12px;
        }

        .store-title {
          font-size: 1.6em;
          font-weight: 900;
          margin: 0;
          color: #000000;
          text-transform: uppercase;
        }

        .store-subtitle {
          font-size: 0.95em;
          font-weight: 800;
          margin: 4px 0 0 0;
          color: #000000;
        }

        .badge-thermal-note {
          display: inline-block;
          background: #000000;
          color: #ffffff;
          font-weight: 900;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.9em;
          margin-top: 6px;
        }

        .section-box {
          border: 1.5px solid #000000;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
          background: #ffffff;
        }

        .section-title {
          font-size: 1.05em;
          font-weight: 900;
          margin: 0 0 6px 0;
          padding-bottom: 4px;
          border-bottom: 1px solid #000000;
          text-transform: uppercase;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 4px 0;
          font-weight: 800;
          line-height: 1.35;
        }

        .info-label {
          font-weight: 900;
          color: #000000;
        }

        .info-val {
          font-weight: 800;
          color: #000000;
          word-break: break-word;
        }

        /* Items List / Table */
        .items-header {
          display: flex;
          justify-content: space-between;
          font-weight: 900;
          border-top: 2px solid #000000;
          border-bottom: 2px solid #000000;
          padding: 6px 0;
          margin-top: 10px;
          font-size: 1.05em;
        }

        .item-row {
          border-bottom: 1px dashed #000000;
          padding: 8px 0;
        }

        .item-title {
          font-weight: 900;
          font-size: 1.1em;
          color: #000000;
          margin-bottom: 4px;
        }

        .item-details {
          display: flex;
          justify-content: space-between;
          font-weight: 800;
          font-size: 0.95em;
        }

        /* Total Box */
        .total-box {
          border: 3px solid #000000;
          background: #ffffff;
          padding: 10px;
          text-align: center;
          margin: 14px 0;
          border-radius: 6px;
        }

        .total-label {
          font-size: 1.1em;
          font-weight: 900;
          margin-bottom: 2px;
        }

        .total-amount {
          font-size: 1.8em;
          font-weight: 900;
          color: #000000;
          font-family: monospace, sans-serif;
        }

        /* Barcode container */
        .barcode-box {
          text-align: center;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 2px dashed #000000;
        }

        .barcode-box svg {
          max-width: 100%;
          height: auto;
        }

        /* QR Codes Section */
        .qr-section {
          display: flex;
          justify-content: space-around;
          align-items: flex-start;
          gap: 12px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 2px dashed #000000;
          text-align: center;
        }

        .qr-card {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #ffffff;
          padding: 6px;
          border: 1px solid #000000;
          border-radius: 6px;
        }

        .qr-title {
          font-size: 0.85em;
          font-weight: 900;
          color: #000000;
          margin-bottom: 4px;
        }

        .qr-img {
          width: 110px;
          height: 110px;
          object-fit: contain;
          display: block;
        }

        .qr-subtitle {
          font-size: 0.7em;
          font-weight: 800;
          color: #000000;
          margin-top: 2px;
          word-break: break-all;
        }

        .receipt-footer {
          text-align: center;
          margin-top: 12px;
          font-weight: 800;
          font-size: 0.9em;
          border-top: 1px solid #000000;
          padding-top: 8px;
        }

        /* PRINT MEDIA OVERRIDES - Optimized for WalkPrint / Thermal Printers */
        @media print {
          body {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-control-bar {
            display: none !important;
          }

          .page-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          .receipt-card {
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            margin: 0 auto !important;
          }

          .mode-thermal {
            max-width: 100% !important; /* Take full available thermal paper roll width */
            padding: 4px !important;
            border: none !important;
          }

          .mode-a4 {
            max-width: 100% !important;
            padding: 10px !important;
            border: none !important;
          }

          @page {
            size: auto;
            margin: 0mm;
          }
        }
      </style>
    </head>
    <body class="mode-${initialMode}">

      <!-- Interactive Controls Toolbar (Hidden when printing) -->
      <div class="print-control-bar no-print">
        <div class="control-group">
          <span style="font-weight:900; font-size:14px; color:#f59e0b;">🖨️ ${isArabic ? 'إعدادات طابعة الفواتير:' : 'Printer Options:'}</span>
          
          <button type="button" id="btnModeThermal" onclick="setMode('thermal')" class="btn-control ${initialMode === 'thermal' ? 'active' : ''}">
            📱 ${isArabic ? 'طابعة حرارية WalkPrint / 58mm-80mm' : 'Portable Thermal (WalkPrint)'}
          </button>
          
          <button type="button" id="btnModeA4" onclick="setMode('a4')" class="btn-control ${initialMode === 'a4' ? 'active' : ''}">
            📄 ${isArabic ? 'فاتورة قياسية A4' : 'Standard A4 Sheet'}
          </button>
        </div>

        <div class="control-group">
          <span style="font-weight:800; font-size:13px; color:#cbd5e1;">🔍 ${isArabic ? 'حجم الخط:' : 'Font Size:'}</span>
          <button type="button" onclick="setFontScale('100')" class="btn-control">${isArabic ? 'عادي' : 'Normal'}</button>
          <button type="button" onclick="setFontScale('115')" class="btn-control active" id="btnFont115">🔍 ${isArabic ? 'كبير (موصى به)' : 'Large (Rec.)'}</button>
          <button type="button" onclick="setFontScale('130')" class="btn-control">${isArabic ? 'ضخم جداً' : 'Extra Large'}</button>
          <button type="button" onclick="setFontScale('150')" class="btn-control">${isArabic ? 'أقصى تكبير' : 'Maximum'}</button>
        </div>

        <div class="control-group">
          <button type="button" onclick="triggerPrint()" class="btn-primary-print">
            🖨️ ${isArabic ? 'طباعة الآن (Print)' : 'Print Receipt Now'}
          </button>
        </div>
      </div>

      <!-- Printable Receipt Wrapper -->
      <div class="page-wrapper">
        <div id="receiptCard" class="receipt-card mode-${initialMode} font-scale-115">
          
          <!-- Store Header -->
          <div class="store-header">
            ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="max-height: 55px; width: auto; margin-bottom: 6px; display: block; margin-left: auto; margin-right: auto;" alt="Logo">` : ''}
            <h1 class="store-title">${storeName}</h1>
            ${ownerName ? `<div class="store-subtitle">${isArabic ? 'بإشراف' : 'By'}: ${ownerName}</div>` : ''}
            ${settings.ownerPhone ? `<div class="store-subtitle">📱 ${settings.ownerPhone}</div>` : ''}
            <div class="badge-thermal-note">🧾 ${isArabic ? 'فاتورة بيع رسمية' : 'Sales Receipt'}</div>
          </div>

          <!-- Order & Date Info -->
          <div class="section-box">
            <div class="info-row">
              <span class="info-label">🔖 ${isArabic ? 'رقم الطلب:' : 'Order ID:'}</span>
              <span class="info-val">#${order.id.slice(0, 10).toUpperCase()}</span>
            </div>
            <div class="info-row">
              <span class="info-label">📅 ${isArabic ? 'التاريخ والوقت:' : 'Date:'}</span>
              <span class="info-val">${order.date}</span>
            </div>
            <div class="info-row">
              <span class="info-label">📌 ${isArabic ? 'حالة الطلب:' : 'Status:'}</span>
              <span class="info-val">${order.status === 'pending' ? (isArabic ? 'قيد التحضير' : 'Pending') : order.status === 'delivered' ? (isArabic ? 'تم التسليم' : 'Delivered') : order.status}</span>
            </div>
          </div>

          <!-- Customer Info -->
          <div class="section-box">
            <div class="section-title">👤 ${isArabic ? 'معلومات العميل والشحن:' : 'Customer Info:'}</div>
            <div class="info-row">
              <span class="info-label">${isArabic ? 'الاسم:' : 'Name:'}</span>
              <span class="info-val">${order.customerName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">${isArabic ? 'الهاتف:' : 'Phone:'}</span>
              <span class="info-val">${order.customerPhone}</span>
            </div>
            ${order.customerAddress ? `
              <div class="info-row">
                <span class="info-label">${isArabic ? 'العنوان:' : 'Address:'}</span>
                <span class="info-val">${order.customerAddress}</span>
              </div>
            ` : ''}
          </div>

          <!-- Purchased Items Header -->
          <div class="items-header">
            <span>${isArabic ? 'المنتج / المكونات' : 'Product'}</span>
            <span>${isArabic ? 'الكمية × السعر' : 'Qty x Price'}</span>
          </div>

          <!-- Purchased Items List -->
          <div class="items-list">
            ${order.items.map((item, idx) => {
              const prod = products.find(p => p.id === item.productId);
              const title = isArabic ? item.titleAr : item.titleEn;
              const subtotal = item.price * item.quantity;
              const weightBadge = item.customWeightText ? ` [⚖️ ${item.customWeightText}]` : '';
              const barcodeText = prod?.barcode ? ` (🏷️ ${prod.barcode})` : '';

              return `
                <div class="item-row">
                  <div class="item-title">
                    ${idx + 1}. ${title}${weightBadge}${barcodeText}
                  </div>
                  <div class="item-details">
                    <span>${item.quantity} × ${item.price} ${currencyStr}</span>
                    <strong style="font-size: 1.05em;">= ${subtotal} ${currencyStr}</strong>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Total Amount Box -->
          <div class="total-box">
            <div class="total-label">💰 ${isArabic ? 'المبلغ الإجمالي الكلي:' : 'TOTAL AMOUNT:'}</div>
            <div class="total-amount">${order.total} ${currencyStr}</div>
          </div>

          <!-- Barcode Box -->
          <div class="barcode-box">
            <div>${barcodeSvg}</div>
            <div style="font-size: 0.85em; font-weight: 800; margin-top: 4px;">ID: ${order.id}</div>
          </div>

          <!-- QR Codes Section (Facebook & Store Link) -->
          <div class="qr-section">
            ${fbQrDataUrl ? `
              <div class="qr-card">
                <div class="qr-title">📘 ${isArabic ? 'صفحة الفيسبوك' : 'Facebook Page'}</div>
                <img src="${fbQrDataUrl}" class="qr-img" alt="Facebook QR">
                <div class="qr-subtitle">امسح لمتابعتنا 📲</div>
              </div>
            ` : ''}

            ${appQrDataUrl ? `
              <div class="qr-card">
                <div class="qr-title">🛒 ${isArabic ? 'رابط تطبيق المتجر' : 'Store Website'}</div>
                <img src="${appQrDataUrl}" class="qr-img" alt="Store App QR">
                <div class="qr-subtitle">امسح لطلب المزيد 🛍️</div>
              </div>
            ` : ''}
          </div>

          <!-- Footer Message -->
          <div class="receipt-footer">
            <div>✨ ${isArabic ? 'شكراً لشرائكم وثقتكم بنا! أهلاً وسهلاً بكم.' : 'Thank you for shopping with us!'}</div>
            <div style="margin-top: 4px; font-size: 0.8em; opacity: 0.8;">© ${storeName} • Printed via WalkPrint / Thermal POS</div>
          </div>

        </div>
      </div>

      <script>
        function setMode(mode) {
          var card = document.getElementById('receiptCard');
          var btnThermal = document.getElementById('btnModeThermal');
          var btnA4 = document.getElementById('btnModeA4');

          if (mode === 'thermal') {
            card.className = card.className.replace(/mode-(thermal|a4)/g, '') + ' mode-thermal';
            document.body.className = document.body.className.replace(/mode-(thermal|a4)/g, '') + ' mode-thermal';
            if (btnThermal) btnThermal.classList.add('active');
            if (btnA4) btnA4.classList.remove('active');
          } else {
            card.className = card.className.replace(/mode-(thermal|a4)/g, '') + ' mode-a4';
            document.body.className = document.body.className.replace(/mode-(thermal|a4)/g, '') + ' mode-a4';
            if (btnA4) btnA4.classList.add('active');
            if (btnThermal) btnThermal.classList.remove('active');
          }
        }

        function setFontScale(scaleClass) {
          var card = document.getElementById('receiptCard');
          card.className = card.className.replace(/font-scale-\d+/g, '') + ' font-scale-' + scaleClass;
          
          var buttons = document.querySelectorAll('.print-control-bar button');
          buttons.forEach(function(btn) {
            if (btn.id !== 'btnModeThermal' && btn.id !== 'btnModeA4') {
              btn.classList.remove('active');
            }
          });
        }

        function triggerPrint() {
          window.print();
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

export async function openMiniThermalPrint({
  order,
  settings,
  products,
  lang,
}: {
  order: Order;
  settings: StoreSettings;
  products: Product[];
  lang: 'ar' | 'en';
}) {
  const isArabic = lang === 'ar';
  const isRtl = isArabic;
  const currencyStr = isArabic ? (settings.currencyAr || 'دج') : (settings.currencyEn || 'DZD');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert(
      isArabic
        ? '⚠️ الرجاء السماح بالنوافذ المنبثقة من إعدادات المتصفح لطباعة التيكيت الميني!'
        : '⚠️ Please allow popup windows in browser settings to print mini receipt!'
    );
    return;
  }

  // Generate high quality QR codes for Mini Thermal Printer
  const facebookUrl = 'https://www.facebook.com/share/191AY6Qxsh/';
  const appUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : facebookUrl;

  let fbQrDataUrl = '';
  let appQrDataUrl = '';

  try {
    fbQrDataUrl = await QRCode.toDataURL(facebookUrl, {
      margin: 1,
      width: 140,
      color: { dark: '#000000', light: '#ffffff' }
    });
    appQrDataUrl = await QRCode.toDataURL(appUrl, {
      margin: 1,
      width: 140,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (err) {
    console.error('Failed to generate mini QR codes', err);
  }

  // Format order date cleanly (e.g. 2026-07-26 00:21:02)
  const dateStr = order.date || new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Summarize products titles, quantities and weights
  const productTitles = order.items.map(i => isArabic ? i.titleAr : i.titleEn).join('، ');
  const qtyStr = order.items.map(i => i.customWeightText ? i.customWeightText : `${i.quantity} ${isArabic ? 'قطعة' : 'pcs'}`).join(' + ');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mini Receipt - ${order.id}</title>
      <style>
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, system-ui, -apple-system, sans-serif;
          color: #000000;
          background-color: #ffffff;
          margin: 0;
          padding: 8px;
          direction: ${isRtl ? 'rtl' : 'ltr'};
          font-size: 16px;
          line-height: 1.4;
          font-weight: 800;
        }

        .mini-ticket {
          max-width: 290px;
          margin: 0 auto;
          padding: 8px 4px;
          background: #ffffff;
          color: #000000;
        }

        .control-bar {
          background: #0f172a;
          color: #ffffff;
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          border-radius: 8px;
          font-family: system-ui, sans-serif;
        }

        .btn-print {
          background: #059669;
          color: white;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }

        .date-header {
          text-align: center;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .dashed-line {
          border-top: 2px dashed #000000;
          margin: 8px 0;
        }

        .content-row-wrapper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 10px 0;
        }

        .logo-box {
          width: 65px;
          height: 65px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 50%;
        }

        .details-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 15px;
        }

        .info-item {
          display: flex;
          align-items: flex-start;
          gap: 4px;
          line-height: 1.35;
        }

        .info-label {
          font-weight: 900;
          white-space: nowrap;
        }

        .info-val {
          font-weight: 900;
          word-break: break-word;
        }

        /* Side by Side QR Code Boxes matching uploaded receipt photo */
        .qr-container {
          display: flex;
          justify-content: space-between;
          align-items: stretch;
          gap: 8px;
          margin-top: 12px;
        }

        .qr-box {
          flex: 1;
          border: 1.5px solid #000000;
          padding: 4px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
        }

        .qr-box img {
          width: 95px;
          height: 95px;
          object-fit: contain;
          display: block;
        }

        .qr-caption {
          font-size: 12px;
          font-weight: 900;
          margin-top: 4px;
          color: #000000;
        }

        @media print {
          body {
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            width: 58mm !important;
          }

          .no-print {
            display: none !important;
          }

          .mini-ticket {
            max-width: 58mm !important;
            width: 58mm !important;
            padding: 2px !important;
            margin: 0 auto !important;
          }

          @page {
            size: 58mm auto;
            margin: 0mm;
          }
        }
      </style>
    </head>
    <body>
      <div class="control-bar no-print" style="flex-wrap: wrap; gap: 8px; background: #0f172a; padding: 12px; border-radius: 12px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span style="font-weight: 900; font-size: 14px; color: #38bdf8;">📱 ${isArabic ? 'تيكيت طابعة حرارية ميني (Mini POS 58mm)' : 'Mini Thermal Receipt 58mm'}</span>
          <span style="font-size: 11px; background: #0284c7; color: white; padding: 2px 8px; border-radius: 99px;">58mm Roll</span>
        </div>

        <!-- Android Printer Warning Notice -->
        <div style="background: #fffbe0; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 8px 10px; width: 100%; font-size: 12px; color: #78350f; font-weight: bold; line-height: 1.4;">
          ⚠️ <b>${isArabic ? 'ملاحظة هامة لتفادي حفظ PDF:' : 'Important Notice:'}</b> 
          ${isArabic 
            ? 'إذا ظهرت لك خيارات (Enregistrer au format PDF) في الأعلى، اضغط على القائمة المنسدلة في أعلى الشاشة واختر اسم طابعتك المقترنة (مثل POS-58 أو PT-210).'
            : 'If "Save as PDF" appears at the top, tap the dropdown menu and select your paired Bluetooth Printer (e.g. POS-58 or PT-210).'}
        </div>

        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; width: 100%; justify-content: flex-end; margin-top: 4px;">
          <button onclick="connectBluetoothPrinter()" class="btn-print" style="background-color: #2563eb; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; padding: 8px 14px;">
            📶 ${isArabic ? 'إرسال مباشر للبلوتوث' : 'Bluetooth Direct'}
          </button>
          <button onclick="triggerPrintNow()" class="btn-print" style="background-color: #059669; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; padding: 8px 14px;">
            🖨️ ${isArabic ? 'طباعة التيكيت' : 'Print Ticket'}
          </button>
          <button onclick="toggleHelp()" class="btn-print" style="background-color: #d97706; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 8px 10px;">
            ❓ ${isArabic ? 'طريقة الربط' : 'Help'}
          </button>
        </div>
      </div>

      <!-- Pairing Help Guide Box (Hidden by default) -->
      <div id="pairingGuide" class="no-print" style="display:none; background: #fffbe0; border: 2px solid #f59e0b; border-radius: 12px; padding: 14px; margin-bottom: 16px; font-size: 13px; color: #1e293b; max-width: 380px; margin-left: auto; margin-right: auto; line-height: 1.5;">
        <div style="font-weight: 900; color: #b45309; font-size: 14px; margin-bottom: 8px; display: flex; items-center; gap: 6px;">
          <span>📲</span> <span>${isArabic ? 'دليل اقتران الطابعة الحرارية (Bluetooth Printer)' : 'Printer Pairing Guide'}</span>
        </div>
        <ol style="margin: 0; padding-inline-start: 18px; display: flex; flex-direction: column; gap: 6px;">
          <li><b>شغّل الطابعة</b> وتأكد من تشغيل البلوتوث فيها.</li>
          <li><b>افتح إعدادات البلوتوث</b> في هاتفك وابحث عن أجهزة جديدة.</li>
          <li><b>اختر اسم الطابعة</b> (مثل <i>PT-210</i> أو <i>POS-58</i> أو <i>MPT-II</i>).</li>
          <li><b>أدخل رمز PIN</b>: <code style="background:#fef3c7; padding:2px 6px; border-radius:4px; font-weight:bold;">0000</code> أو <code style="background:#fef3c7; padding:2px 6px; border-radius:4px; font-weight:bold;">1234</code>.</li>
        </ol>
      </div>

      <div id="btStatus" class="no-print" style="display:none; background: #e0f2fe; border: 1px solid #0284c7; color: #0369a1; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px; font-weight: bold; text-align: center; max-width: 380px; margin-left: auto; margin-right: auto;"></div>

      <div class="mini-ticket">
        <div class="date-header">${dateStr}</div>
        <div class="dashed-line"></div>

        <div class="content-row-wrapper">
          ${settings.logoUrl ? `
            <div class="logo-box">
              <img src="${settings.logoUrl}" class="logo-img" alt="Logo">
            </div>
          ` : ''}

          <div class="details-list">
            <div class="info-item">
              <span class="info-label">${isArabic ? 'المنتج :' : 'Product :'}</span>
              <span class="info-val">${productTitles}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${isArabic ? 'الكمية :' : 'Qty :'}</span>
              <span class="info-val">${qtyStr}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${isArabic ? 'الثمن :' : 'Price :'}</span>
              <span class="info-val">${order.total} ${currencyStr}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${isArabic ? 'رقم :' : 'Phone :'}</span>
              <span class="info-val" dir="ltr">${order.customerPhone}</span>
            </div>
          </div>
        </div>

        <div class="qr-container">
          ${appQrDataUrl ? `
            <div class="qr-box">
              <img src="${appQrDataUrl}" alt="Store QR">
              <div class="qr-caption">${isArabic ? 'لطلب من الموقع' : 'Order Online'}</div>
            </div>
          ` : ''}

          ${fbQrDataUrl ? `
            <div class="qr-box">
              <img src="${fbQrDataUrl}" alt="FB QR">
              <div class="qr-caption">${isArabic ? 'fb المتابعة على' : 'Follow on FB'}</div>
            </div>
          ` : ''}
        </div>

        <div class="dashed-line"></div>
      </div>

      <script>
        function toggleHelp() {
          var el = document.getElementById('pairingGuide');
          if (el) {
            el.style.display = (el.style.display === 'none') ? 'block' : 'none';
          }
        }

        function triggerPrintNow() {
          window.print();
        }

        async function connectBluetoothPrinter() {
          var statusEl = document.getElementById('btStatus');
          if (!statusEl) return;
          statusEl.style.display = 'block';

          if (!navigator.bluetooth) {
            statusEl.style.backgroundColor = '#fef2f2';
            statusEl.style.borderColor = '#f87171';
            statusEl.style.color = '#991b1b';
            statusEl.innerHTML = '⚠️ متصفحك لا يدعم Web Bluetooth. يمكنك استخدام زر [طباعة التيكيت 🖨️] وإلغاء حفظ PDF واختيار الطابعة المقترنة.';
            return;
          }

          try {
            statusEl.style.backgroundColor = '#e0f2fe';
            statusEl.style.borderColor = '#0284c7';
            statusEl.style.color = '#0369a1';
            statusEl.innerHTML = '🔍 جاري البحث عن الطابعة المقترنة بالبلوتوث... اختر طابعتك من القائمة المنبثقة.';

            var device = await navigator.bluetooth.requestDevice({
              acceptAllDevices: true,
              optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '00001101-0000-1000-8000-00805f9b34fb',
                '0000ff00-0000-1000-8000-00805f9b34fb',
                '0000ae01-0000-1000-8000-00805f9b34fb',
                '0000af00-0000-1000-8000-00805f9b34fb',
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
              ]
            });

            statusEl.innerHTML = '⏳ جاري الاتصال بالطابعة: ' + (device.name || 'Bluetooth Printer') + '...';

            var server = await device.gatt.connect();

            // Find writable characteristic
            var targetChar = null;
            var services = await server.getPrimaryServices();
            for (var i = 0; i < services.length; i++) {
              var service = services[i];
              try {
                var chars = await service.getCharacteristics();
                for (var j = 0; j < chars.length; j++) {
                  var c = chars[j];
                  if (c.properties.write || c.properties.writeWithoutResponse) {
                    targetChar = c;
                    break;
                  }
                }
              } catch(e){}
              if (targetChar) break;
            }

            if (!targetChar) {
              statusEl.style.backgroundColor = '#fffbe0';
              statusEl.style.borderColor = '#f59e0b';
              statusEl.style.color = '#92400e';
              statusEl.innerHTML = '⚠️ تم الاتصال بالطابعة، اضغط [طباعة التيكيت 🖨️] واختر اسم طابعتك المقترنة.';
              return;
            }

            statusEl.style.backgroundColor = '#ecfdf5';
            statusEl.style.borderColor = '#10b981';
            statusEl.style.color = '#065f46';
            statusEl.innerHTML = '✅ تم الاتصال بنجاح! جاري إرسال البيانات فوراً للطابعة...';

            var encoder = new TextEncoder();
            var textData = "\n" +
              "--------------------------------\n" +
              "       ${dateStr}\n" +
              "--------------------------------\n" +
              "المنتج : ${productTitles}\n" +
              "الكمية : ${qtyStr}\n" +
              "الثمن : ${order.total} ${currencyStr}\n" +
              "رقم : ${order.customerPhone}\n" +
              "--------------------------------\n\n\n";

            var initCmd = new Uint8Array([0x1B, 0x40, 0x1B, 0x61, 0x01]);
            var bodyCmd = encoder.encode(textData);
            var cutCmd = new Uint8Array([0x1D, 0x56, 0x00]);

            var fullBuffer = new Uint8Array(initCmd.length + bodyCmd.length + cutCmd.length);
            fullBuffer.set(initCmd, 0);
            fullBuffer.set(bodyCmd, initCmd.length);
            fullBuffer.set(cutCmd, initCmd.length + bodyCmd.length);

            var chunkSize = 512;
            for (var offset = 0; offset < fullBuffer.length; offset += chunkSize) {
              var chunk = fullBuffer.slice(offset, offset + chunkSize);
              if (targetChar.properties.write) {
                await targetChar.writeValue(chunk);
              } else {
                await targetChar.writeValueWithoutResponse(chunk);
              }
            }

            statusEl.innerHTML = '🎉 تم إرسال الأمر وطباعة الفاتورة على الورق الحراري بنجاح!';

          } catch (err) {
            console.error(err);
            statusEl.style.backgroundColor = '#fffbe0';
            statusEl.style.borderColor = '#f59e0b';
            statusEl.style.color = '#92400e';
            statusEl.innerHTML = '💡 اختر طابعتك من القائمة المنسدلة في شاشة الطباعة أو اضغط [طباعة التيكيت 🖨️].';
          }
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
