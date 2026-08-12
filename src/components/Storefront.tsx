import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { 
  ShoppingBag, 
  X, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  CheckCircle, 
  Download, 
  LayoutDashboard,
  Eye,
  Check,
  Menu,
  ChevronDown,
  ShoppingBag as CartIcon,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { Product, CartItem, Language, TranslationDictionary, Order, StoreSettings } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db, normalizePhone } from '../lib/firebase';
import { BarcodeSVG } from './BarcodeSVG';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { getBarcodeSVGString } from '../lib/invoiceBarcode';
import { openPrintInvoice, openMiniThermalPrint } from '../lib/invoicePrinter';
import { PrinterPairingModal } from './PrinterPairingModal';
import { MiniTicketModal } from './MiniTicketModal';

interface StorefrontProps {
  products: Product[];
  isLoadingProducts?: boolean;
  orders?: Order[];
  cart: CartItem[];
  lang: Language;
  dict: TranslationDictionary;
  settings: StoreSettings;
  onAddToCart: (product: Product, selectedWeightGrams?: number, customWeightText?: string) => void;
  onUpdateCartQty: (productId: string, qty: number, selectedWeightGrams?: number) => void;
  onRemoveFromCart: (productId: string, selectedWeightGrams?: number) => void;
  onPlaceOrder: (details: {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerEmail: string;
  }) => Promise<Order | null> | Order | null;
  onToggleLanguage: () => void;
  onAddReview: (productId: string, userName: string, rating: number, comment: string) => void;
  onGoToAdmin: () => void;
}

export default function Storefront({
  products,
  isLoadingProducts = false,
  orders = [],
  cart,
  lang,
  dict,
  settings,
  onAddToCart,
  onUpdateCartQty,
  onRemoveFromCart,
  onPlaceOrder,
  onToggleLanguage,
  onAddReview,
  onGoToAdmin
}: StorefrontProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isMenuDropdownOpen, setIsMenuDropdownOpen] = useState(false);
  const [isStorefrontScannerOpen, setIsStorefrontScannerOpen] = useState(false);
  const [scanToast, setScanToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const handleBarcodeScanSuccess = (scannedBarcode: string) => {
    const matchedProduct = products.find(p => p.barcode === scannedBarcode);
    if (matchedProduct) {
      onAddToCart(matchedProduct);
      
      const name = lang === 'ar' ? matchedProduct.titleAr : matchedProduct.titleEn;
      const successMsg = lang === 'ar' 
        ? `تم رصد المنتج: "${name}" وإضافته مباشرة إلى سلة الشراء بنجاح!` 
        : `Product detected: "${name}" and added directly to your cart successfully!`;
      
      setScanToast({ message: successMsg, type: 'success' });
      setTimeout(() => setScanToast(null), 4000);
      setSearchTerm(scannedBarcode);
    } else {
      const errorMsg = lang === 'ar'
        ? `عذراً! لا يوجد منتج مسجل بالرمز الكودي: "${scannedBarcode}" في المتجر.`
        : `Oops! No registered merchandise found with barcode: "${scannedBarcode}".`;
        
      setScanToast({ message: errorMsg, type: 'error' });
      setTimeout(() => setScanToast(null), 4500);
    }
  };
  
  // Tracking States
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showPrinterPairingGuide, setShowPrinterPairingGuide] = useState(false);
  const [miniTicketOrder, setMiniTicketOrder] = useState<Order | null>(null);
  const [trackingQuery, setTrackingQuery] = useState('');
  const [trackedOrders, setTrackedOrders] = useState<Order[] | null>(null);
  const [hasSearchedTrack, setHasSearchedTrack] = useState(false);

  const [isSearchingTrack, setIsSearchingTrack] = useState(false);

  const performTrackingSearch = async () => {
    setHasSearchedTrack(true);
    const q = trackingQuery.trim();
    if (!q) {
      setTrackedOrders(null);
      return;
    }

    setIsSearchingTrack(false);
    setIsSearchingTrack(true);
    try {
      // Normalize entered search value as phone number using root utility
      const cleanPhone = normalizePhone(q);
      const isDigitsOnly = /^\d+$/.test(cleanPhone);

      let foundOrders: Order[] = [];

      // A. Try phone mapping lookup first if search query contains valid normalized digits (at least 6 digits to identify a valid phone)
      if (isDigitsOnly && cleanPhone.length >= 6) {
        const phoneDocRef = doc(db, 'phone_orders', cleanPhone);
        const phoneDocSnap = await getDoc(phoneDocRef);
        if (phoneDocSnap.exists()) {
          const mappingData = phoneDocSnap.data();
          const orderIds: string[] = mappingData?.orderIds || [];
          
          // Fetch all matching orders concurrently
          const fetchPromises = orderIds.map(async (id) => {
            try {
              const orderDocSnap = await getDoc(doc(db, 'orders', id));
              if (orderDocSnap.exists()) {
                return orderDocSnap.data() as Order;
              }
            } catch (innerErr) {
              console.error("Error fetching order in list mapping: ", id, innerErr);
            }
            return null;
          });

          const results = await Promise.all(fetchPromises);
          // Filter out missing/deleted orders
          foundOrders = results.filter((o): o is Order => o !== null);
          
          // Sort orders descending so latest show up first
          foundOrders.sort((a, b) => b.id.localeCompare(a.id));
        }
      }

      // B. If no phone mapping was matched, or if the search was not a phone number, fallback to single Order ID lookup
      if (foundOrders.length === 0) {
        // 1. Try exact document ID lookup
        const docRef = doc(db, 'orders', q);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          foundOrders = [docSnap.data() as Order];
        } else {
          // 2. Try prefixed order ID helper (e.g. ord-XXXX)
          const altId = q.startsWith('ord-') ? q : `ord-${q}`;
          const docRefAlt = doc(db, 'orders', altId);
          const docSnapAlt = await getDoc(docRefAlt);
          if (docSnapAlt.exists()) {
            foundOrders = [docSnapAlt.data() as Order];
          }
        }
      }

      if (foundOrders.length > 0) {
        setTrackedOrders(foundOrders);
      } else {
        setTrackedOrders(null);
      }
    } catch (err) {
      console.error("Order tracking retrieval failed: ", err);
      setTrackedOrders(null);
    } finally {
      setIsSearchingTrack(false);
    }
  };
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipeProductModal, setRecipeProductModal] = useState<Product | null>(null);
  const [copiedRecipe, setCopiedRecipe] = useState<boolean>(false);
  const [recipeScaleMode, setRecipeScaleMode] = useState<'grams' | 'pieces'>('grams');
  const [recipeTargetGrams, setRecipeTargetGrams] = useState<number>(1000);
  const [recipeTargetPieces, setRecipeTargetPieces] = useState<number>(10);
  const [recipeCustomInput, setRecipeCustomInput] = useState<string>('1000');
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Ingredient scaling calculation helper
  const getRecipeScaleRatio = (product: Product | null) => {
    if (!product) return 1;
    if (recipeScaleMode === 'grams') {
      // Base recipe is 1000 grams (1 kg)
      return recipeTargetGrams / 1000;
    } else {
      // Base recipe is 10 pieces
      return recipeTargetPieces / 10;
    }
  };

  const scaleIngredientsText = (rawText: string, ratio: number) => {
    if (!rawText || Math.abs(ratio - 1) < 0.001 || ratio <= 0) return rawText;

    return rawText
      .split('\n')
      .map((line) => {
        // Scale fractions like 1/2, 1/4, 3/4
        let updatedLine = line.replace(/(\d+)\/(\d+)/g, (_, num, den) => {
          const val = (parseFloat(num) / parseFloat(den)) * ratio;
          return Number.isInteger(val) ? val.toString() : val.toFixed(1).replace(/\.0$/, '');
        });

        // Match numbers with optional trailing units
        updatedLine = updatedLine.replace(/\b(\d+(?:\.\d+)?)\s*(كغ|كيلوغرام|غرام|غ|كيلة|كيلات|لتر|كأس|كؤوس|ملعقة|ملاعق|حبة|حبات|قرصة|قبصة|kg|g|ml|l|tbsp|tsp|cups|pcs|pieces)?/gi, (match, numStr, unit) => {
          const num = parseFloat(numStr);
          if (isNaN(num)) return match;

          const scaledNum = num * ratio;
          const formattedNum = Number.isInteger(scaledNum) ? scaledNum.toString() : scaledNum.toFixed(1).replace(/\.0$/, '');

          if (unit) {
            // Convert scaled grams to kg if >= 1000g for clean readability
            if ((unit.toLowerCase() === 'غ' || unit.toLowerCase() === 'غرام' || unit.toLowerCase() === 'g') && scaledNum >= 1000) {
              const kgVal = (scaledNum / 1000).toFixed(1).replace(/\.0$/, '');
              const unitKg = (unit.toLowerCase() === 'g') ? 'kg' : 'كغ';
              return `${kgVal} ${unitKg}`;
            }
            return `${formattedNum} ${unit}`;
          }
          return formattedNum;
        });

        return updatedLine;
      })
      .join('\n');
  };

  const getIngredientsTextForProduct = (product: Product | null, isRtl: boolean) => {
    if (!product) return '';
    const text = isRtl
      ? product.ingredientsAr || product.ingredientsEn
      : product.ingredientsEn || product.ingredientsAr;
    
    if (text && text.trim().length > 0) return text;

    if (isRtl) {
      return "1 كغ طحين فاخر (فرينة)، 250غ سمن ممتاز ذائب، 100غ سكر ناعم، رشة ملح، ماء زهر معتق للجمع.\nالحشو: 500غ مكسرات مرحية (لوز/جوز)، 150غ سكر، 1 ملعقة صغيرة قرفة، ماء زهر.\nالقطر/العسل: 1 كغ عسل طبيعي معطر بماء الزهر.";
    } else {
      return "1kg premium flour, 250g clarified butter, 100g powdered sugar, pinch of salt, blossom water.\nFilling: 500g ground nuts, 150g sugar, 1 tsp cinnamon, blossom water.\nSyrup: 1kg natural honey infused with blossom water.";
    }
  };

  const getRecipeTextForProduct = (product: Product | null, isRtl: boolean) => {
    if (!product) return '';
    const text = isRtl
      ? product.recipeAr || product.recipeEn
      : product.recipeEn || product.recipeAr;
    
    if (text && text.trim().length > 0) return text;

    if (isRtl) {
      return "1. نخلط الفرينة مع السمن الذائب والملح ونفرك الخليط جيداً بكفي اليدين.\n2. نجمع العجينة بماء الزهر المعتق حتى تصبح ملساء وطرية، ونتركها ترتاح.\n3. نخلط المكسرات مع السكر والقرفة ونرش بماء الزهر لتحضير العقدة.\n4. نشكل الحبات برفق ونرتبها في صينية الفرن.\n5. تخبز في فرن معتدل الحرارة حتى تكتسب لوناً ذهبياً، ثم تسقى بالعسل الدافئ فور خروجها.";
    } else {
      return "1. Combine flour with melted butter and salt, rub thoroughly.\n2. Bind dough with blossom water until smooth and soft, then rest.\n3. Mix nuts with sugar and cinnamon, moisten with blossom water for filling.\n4. Shape delicate sweets and arrange on baking sheet.\n5. Bake in moderate oven until golden, then drench in warm honey syrup.";
    }
  };

  // Scale Modal state for sweets & weighted items
  const [scaleProduct, setScaleProduct] = useState<Product | null>(null);
  const [scaleMode, setScaleMode] = useState<'preset' | 'custom_grams' | 'custom_price'>('preset');
  const [selectedPresetGrams, setSelectedPresetGrams] = useState<number>(1000);
  const [customGramsInput, setCustomGramsInput] = useState<string>('500');
  const [customDzdInput, setCustomDzdInput] = useState<string>('');

  const formatWeightText = (grams: number, isArabic: boolean) => {
    if (grams === 500) return isArabic ? '0.5 كغ (500غ)' : '0.5 kg (500g)';
    if (grams === 1000) return isArabic ? '1 كغ (1000غ)' : '1 kg (1000g)';
    if (grams === 2000) return isArabic ? '2 كغ (2000غ)' : '2 kg (2000g)';
    if (grams >= 1000) {
      const kg = (grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2);
      return isArabic ? `${kg} كغ (${grams}غ)` : `${kg} kg (${grams}g)`;
    }
    return isArabic ? `${grams} غرام` : `${grams}g`;
  };
  
  const [zoomImageSrc, setZoomImageSrc] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Custom interactive animations and cart notifications
  const [cartBounce, setCartBounce] = useState(false);
  const [latestAddedItem, setLatestAddedItem] = useState<Product | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [addedItemTimer, setAddedItemTimer] = useState<number>(100);
  const toastTimerRef = React.useRef<any>(null);
  const progressTimerRef = React.useRef<any>(null);

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomScale(prev => {
    const next = prev - 0.5;
    if (next <= 1) {
      setPanPosition({ x: 0, y: 0 });
      return 1;
    }
    return next;
  });
  const handleZoomReset = () => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomScale <= 1) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoomScale <= 1 || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - panPosition.x, y: touch.clientY - panPosition.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || zoomScale <= 1 || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPanPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    });
  };

  const handleImageDoubleClick = () => {
    if (zoomScale > 1) {
      handleZoomReset();
    } else {
      setZoomScale(2);
    }
  };

  const handleAddToCartLocal = (product: Product, weightGrams?: number, customText?: string) => {
    onAddToCart(product, weightGrams, customText);

    // Set bouncing animation state
    setCartBounce(true);
    setTimeout(() => setCartBounce(false), 850);

    // Set and trigger sliding success notification toast
    setLatestAddedItem(product);
    setShowToast(true);
    setAddedItemTimer(100);

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    const intervalTime = 20; 
    const totalDuration = 2800; // time toast stays open
    let elapsed = 0;
    
    progressTimerRef.current = setInterval(() => {
      elapsed += intervalTime;
      const remainingPct = Math.max(0, 100 - (elapsed / totalDuration) * 100);
      setAddedItemTimer(remainingPct);
      if (elapsed >= totalDuration) {
        clearInterval(progressTimerRef.current);
      }
    }, intervalTime);

    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, totalDuration);
  };
  
  // Checkout Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Invoice/Order placed state for receipt downloading
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  const isRtl = lang === 'ar';

  const cartTotal = cart.reduce((sum, item) => {
    const p = item.product;
    const actualPrice = (p.discountPrice !== undefined && p.discountPrice > 0 && p.discountPrice < p.price) ? p.discountPrice : p.price;
    return sum + actualPrice * item.quantity;
  }, 0);

  // Filter products based on search term and category (ensuring only sweets products are shown)
  const filteredProducts = products.filter((p) => {
    // Restrict strictly to sweets items
    const sweetsCategories = ['sweets', 'baklava', 'traditional', 'cakes', 'boxes'];
    const isSweetsItem = p.isWeighted || sweetsCategories.includes(p.category) || (p.categoryAr && p.categoryAr.includes('حلويات'));
    if (!isSweetsItem) return false;

    const term = searchTerm.toLowerCase();
    const title = lang === 'ar' ? p.titleAr : p.titleEn;
    const desc = lang === 'ar' ? p.descriptionAr : p.descriptionEn;
    const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(term) : false;
    
    const matchesSearch = title.toLowerCase().includes(term) || desc.toLowerCase().includes(term) || barcodeMatch;
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const order = await onPlaceOrder({
      customerName,
      customerPhone,
      customerAddress,
      customerEmail
    });

    if (order) {
      setPlacedOrder(order);
      setShowCheckoutModal(false);
      
      // Clear form inputs
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setCustomerEmail('');
    }
  };

  const handleDownloadInvoice = async (order: Order) => {
    await openPrintInvoice({
      order,
      settings,
      products,
      lang,
      initialMode: 'thermal'
    });
  };

  const handleMiniThermalPrint = (order: Order) => {
    setMiniTicketOrder(order);
  };

  return (
    <div className={`min-h-screen bg-[#fcf9f6] text-slate-800 ${isRtl ? 'rtl font-sans' : 'ltr font-sans'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Dynamic alert banner to let user toggle and view notifications */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white text-xs py-3.5 text-center font-extrabold border-b border-orange-500/20 px-4 shadow-sm">
        {isRtl 
          ? (settings.promoMsgAr || `🎉 شحن مجاني لأول ثلاثة طلبات فوق 400 ${settings.currencyAr || 'د.ج'}! كود الكوبون: WELCOME`) 
          : (settings.promoMsgEn || `🎉 Free Shipping on your first 3 orders above 400 ${settings.currencyEn || 'DZD'}! Promo code: WELCOME`)}
      </div>

      {/* HEADER SECTION */}
      <header className="bg-white/90 backdrop-blur-md border-b border-orange-100/30 shadow-xs sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Logo Title */}
          <div className="flex items-center gap-2.5">
            {settings.logoUrl ? (
              <img 
                src={settings.logoUrl} 
                alt="Logo" 
                className="w-12 h-12 object-cover rounded-xl shadow-md border border-slate-100" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-11 h-11 bg-slate-900 rounded-2xl flex items-center justify-center text-orange-500 shadow-md">
                <ShoppingBag className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-black text-slate-909 text-slate-900 tracking-tight">
                {lang === 'ar' ? settings.storeNameAr : settings.storeNameEn}
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {isRtl ? `بإشراف: ${settings.ownerNameAr}` : `Managed by: ${settings.ownerNameEn}`}
              </p>
            </div>
          </div>

          {/* Action buttons (Dropdown Menu for Utilities, Cart indicator with dynamic badge) */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Options Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => setIsMenuDropdownOpen(!isMenuDropdownOpen)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 focus:outline-none"
                aria-haspopup="true"
                aria-expanded={isMenuDropdownOpen}
              >
                <Menu className="w-4 h-4 text-slate-600" />
                <span>{isRtl ? 'القائمة خيارات' : 'Menu options'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-250 ${isMenuDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMenuDropdownOpen && (
                <>
                  {/* Underlay layer to dismiss the dropdown */}
                  <div 
                    className="fixed inset-0 z-45 cursor-default" 
                    onClick={() => setIsMenuDropdownOpen(false)}
                  />
                  {/* Dropdown List */}
                  <div 
                    className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-52 bg-white border border-slate-150 rounded-2xl shadow-xl py-2.5 z-50 animate-fade-in`}
                    dir={isRtl ? 'rtl' : 'ltr'}
                  >
                    {/* Toggle Language */}
                    <button
                      onClick={() => {
                        setIsMenuDropdownOpen(false);
                        onToggleLanguage();
                      }}
                      className="w-full text-right px-4 py-2.5 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-2.5 border-b border-slate-50"
                      style={{ textAlign: isRtl ? 'right' : 'left' }}
                    >
                      <span className="text-sm">🌐</span>
                      <span>{dict.changeLanguage}</span>
                    </button>

                    {/* Track Order */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuDropdownOpen(false);
                        setTrackingQuery('');
                        setTrackedOrders(null);
                        setHasSearchedTrack(false);
                        setShowTrackingModal(true);
                      }}
                      className="w-full text-right px-4 py-2.5 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-2.5 border-b border-slate-50"
                      style={{ textAlign: isRtl ? 'right' : 'left' }}
                    >
                      <span className="text-sm">📋</span>
                      <span>{dict.trackOrder}</span>
                    </button>

                    {/* Go to Dashboard */}
                    <button
                      onClick={() => {
                        setIsMenuDropdownOpen(false);
                        onGoToAdmin();
                      }}
                      className="w-full text-right px-4 py-2.5 hover:bg-orange-50/65 text-slate-850 text-xs font-black transition-all flex items-center gap-2.5 text-orange-800"
                      style={{ textAlign: isRtl ? 'right' : 'left' }}
                    >
                      <LayoutDashboard className="w-4 h-4 text-orange-600" />
                      <span className="text-orange-700 font-extrabold">{dict.dashboard}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200 mx-0.5"></div>

            <button
               onClick={() => setShowCartDrawer(true)}
               className={`flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-550 text-white rounded-full transition-all duration-300 relative border border-orange-500/20 shadow-md shadow-orange-500/10 hover:shadow-lg hover:shadow-orange-550/20 cursor-pointer ${
                 cartBounce ? 'animate-cart-pop' : 'hover:scale-105 active:scale-95'
               }`}
               aria-label="Shopping Cart"
            >
              <div className="p-1 bg-white/15 rounded-full shrink-0">
                <CartIcon className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col items-start leading-none pr-0.5">
                <span className="text-[9px] text-orange-100 font-bold uppercase tracking-wider">
                  {isRtl ? 'سلة الشراء' : 'Basket info'}
                </span>
                <span className="text-[11px] font-black font-mono">
                  {cart.length > 0 ? `${cartTotal} ${isRtl ? settings.currencyAr : settings.currencyEn}` : (isRtl ? 'فارغة' : 'Empty')}
                </span>
              </div>
              {cart.length > 0 && (
                <span className="flex-shrink-0 bg-white text-orange-600 text-[10px] font-extrabold w-5.5 h-5.5 rounded-full flex items-center justify-center font-mono shadow-sm">
                  {cart.reduce((count, item) => count + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>

        </div>
      </header>

      {/* SEARCH AND CATEGORY NAVIGATION BANNER FOR SWEETS STORE */}
      <section className="bg-gradient-to-b from-amber-50/70 via-orange-50/20 to-white border-b border-amber-200/60 py-6 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            
            {/* Header Title & Badge */}
            <div className="space-y-1 text-center md:text-right" style={{ textAlign: isRtl ? 'right' : 'left' }}>
              <div className="inline-flex items-center gap-2 bg-amber-100/90 text-amber-900 border border-amber-300/80 px-3.5 py-1 rounded-full text-xs font-black shadow-2xs">
                <span>🍯</span>
                <span>{isRtl ? 'حلويات فاخرة وتقليدية بالميزان (الكيلوغرام أو الغرام)' : 'Royal Sweets & Pastries Sold By Weight'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {isRtl ? 'قائمة أشهى الحلويات المتاحة للطلب الفوري' : 'Gourmet Sweets & Pastries Catalog'}
              </h2>
            </div>

            {/* Realtime Search Component with scan option */}
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="relative w-full md:w-80">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={dict.searchBarcodePlaceholder}
                  className="w-full bg-white border border-amber-300 rounded-2xl px-4 py-3 pl-11 pr-10 text-sm text-slate-850 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all shadow-xs"
                />
                <Search className="w-5 h-5 text-amber-600 absolute left-3.5 top-3.5" />
                
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-650 font-bold animate-fade-in"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setIsStorefrontScannerOpen(true)}
                type="button"
                className="px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-xs font-black shrink-0 outline-none hover:scale-103 active:scale-97 cursor-pointer"
                title={dict.scanBarcode}
              >
                📷 <span>{dict.scanBarcode}</span>
              </button>
            </div>

          </div>

          {/* Categorized filter tags */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4.5 py-2 text-xs font-extrabold rounded-xl transition-all duration-300 border shadow-2xs cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-700 text-white shadow-md shadow-amber-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300'
                }`}
              >
                {dict.allCategories}
              </button>
              {Object.keys(dict.categories).map((catKey) => (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-4.5 py-2 text-xs font-extrabold rounded-xl transition-all duration-300 border shadow-2xs cursor-pointer ${
                    selectedCategory === catKey
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-700 text-white shadow-md shadow-amber-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300'
                  }`}
                >
                  {dict.categories[catKey as keyof typeof dict.categories]}
                </button>
              ))}
            </div>

          </div>

        </div>
      </section>

      {/* PRODUCTS DISPLAY GRID */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {isLoadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div 
                key={n} 
                className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm flex flex-col justify-between h-[450px]"
              >
                <div className="bg-slate-100 h-56 w-full" />
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="h-5 bg-slate-150 rounded w-2/3" />
                    <div className="space-y-2">
                      <div className="h-3 bg-slate-100 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-5/6" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-50">
                    <div className="h-6 bg-slate-205 rounded w-16" />
                    <div className="h-10 bg-slate-205 rounded-full w-28" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto p-8">
            <ShoppingBag className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-800">{isRtl ? 'لا توجد منتجات مطابقة' : 'No matching products'}</h3>
            <p className="text-slate-450 text-sm mt-1">{isRtl ? 'حاول تغيير معايير البحث أو تصفية الفئة المحددة.' : 'Try adjusting search inputs or changing category tab.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {filteredProducts.map((p) => {
              const displayTitle = lang === 'ar' ? p.titleAr : p.titleEn;
              const displayDesc = lang === 'ar' ? p.descriptionAr : p.descriptionEn;
              return (
                <div 
                  key={p.id} 
                  className="bg-white rounded-[24px] border border-orange-100/35 overflow-hidden shadow-[0_8px_30px_rgb(249,115,22,0.015)] hover:shadow-[0_12px_40px_rgb(249,115,22,0.06)] flex flex-col justify-between group hover:-translate-y-1.5 transition-all duration-300 relative border-b-4 border-b-transparent hover:border-b-orange-550"
                >
                  {/* Category overlay */}
                  <span className="absolute top-4 right-4 bg-white/95 backdrop-blur-xs text-slate-800 font-bold text-[10px] px-3 py-1 rounded-full shadow-md capitalize tracking-wider font-mono z-10 border border-slate-100">
                    {lang === 'ar' ? p.categoryAr : p.category}
                  </span>

                  {p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price && (
                    <span className="absolute top-4 left-4 bg-gradient-to-r from-rose-600 to-pink-600 text-white font-black text-[10px] px-3 py-1 rounded-full shadow-md z-10 tracking-widest animate-pulse">
                      {lang === 'ar' ? 'تخفيض 🔥' : 'SALE 🔥'}
                    </span>
                  )}

                  {/* Product Image Panel */}
                  <div 
                    onClick={() => {
                      setSelectedProduct(p);
                      setActiveImageIndex(0);
                    }}
                    className="aspect-[4/3] w-full bg-slate-50 overflow-hidden relative cursor-pointer group/img"
                    title={isRtl ? 'اضغط لعرض تفاصيل المنتج' : 'Click to view product details'}
                  >
                    <img 
                      src={p.image} 
                      alt={displayTitle} 
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-all duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-white/95 text-slate-800 text-[11px] font-black px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 border border-slate-100 animate-sans">
                        👁️ {isRtl ? 'عرض التفاصيل' : 'View Details'}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-900 group-hover:text-orange-600 transition-all text-base md:text-lg line-clamp-1 leading-tight">
                        {displayTitle}
                      </h3>
                      {p.reviews && p.reviews.length > 0 ? (
                        <div className="flex items-center gap-1 text-xs">
                          <div className="flex items-center text-amber-500">
                            {Array.from({ length: 5 }).map((_, i) => {
                              const avg = p.reviews!.reduce((s, r) => s + r.rating, 0) / p.reviews!.length;
                              return (
                                <span key={i} className="text-xs">
                                  {i < Math.round(avg) ? '★' : '☆'}
                                </span>
                              );
                            })}
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold">({p.reviews.length})</span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-300 font-medium">☆☆☆☆☆ ({isRtl ? 'لا تقييم' : 'No reviews'})</p>
                      )}
                      <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed">
                        {displayDesc}
                      </p>
                      
                      {p.barcode && (
                        <div className="flex items-center gap-1.5 mt-2.5">
                          <span className="text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-150 text-slate-500 hover:text-slate-750 font-mono px-2 py-0.5 rounded font-extrabold tracking-wider flex items-center gap-1 group/barcode relative cursor-help">
                            🏷️ {dict.barcodeLabel}: {p.barcode}
                            {/* SVG barcode visualization on hover! */}
                            <div className={`absolute bottom-full mb-2 hidden group-hover/barcode:block z-50 bg-white p-2.5 text-center rounded-2xl border border-slate-200 shadow-xl ${isRtl ? 'right-0' : 'left-0'}`}>
                              <BarcodeSVG value={p.barcode} width={1.1} height={32} showText={false} />
                              <span className="text-[9px] text-slate-400 font-mono block mt-1 tracking-wider">{p.barcode}</span>
                            </div>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="space-y-0.5 animate-fade-in">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-405 text-[10px] font-bold uppercase tracking-wider">{isRtl ? 'السعر الحالي' : 'Price'}</span>
                          {(p.isWeighted || p.unitType === 'kg') && (
                            <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-black">
                              ⚖️ {isRtl ? 'بالميزان' : 'By Weight'}
                            </span>
                          )}
                        </div>
                        {p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] text-slate-400 line-through font-mono">
                                {p.price} {lang === 'ar' ? settings.currencyAr : settings.currencyEn} {(p.isWeighted || p.unitType === 'kg') ? '/ 1 كغ' : ''}
                              </span>
                              <span className="bg-rose-50 border border-rose-100 text-rose-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                                -{Math.round(((p.price - p.discountPrice) / p.price) * 100)}%
                              </span>
                            </div>
                            <p className="text-xl font-black text-rose-600 font-mono leading-none">
                              {p.discountPrice} <span className="text-xs font-sans text-emerald-600 font-bold">{lang === 'ar' ? settings.currencyAr : settings.currencyEn}</span> {(p.isWeighted || p.unitType === 'kg') ? <span className="text-[10px] text-slate-400 font-normal">/ 1 كغ</span> : ''}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xl font-black text-slate-905 font-mono">
                            {p.price} <span className="text-xs font-sans text-orange-600 font-bold">{lang === 'ar' ? settings.currencyAr : settings.currencyEn}</span> {(p.isWeighted || p.unitType === 'kg') ? <span className="text-[10px] text-slate-400 font-normal">/ 1 كغ</span> : ''}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        {p.stock === 0 ? (
                          <span className="inline-block bg-rose-50 text-rose-705 border border-rose-105 rounded-lg text-[10px] font-bold px-2 py-1">
                            {dict.outOfStock}
                          </span>
                        ) : p.stock < 5 ? (
                          <span className="inline-block bg-amber-50 text-amber-705 border border-amber-105 rounded-lg text-[10px] font-bold px-2 py-1">
                            {dict.stockLeft.replace('{count}', String(p.stock))}
                          </span>
                        ) : (
                          <span className="inline-block bg-slate-50 text-slate-500 border border-slate-105 rounded-lg text-[10px] font-bold px-2 py-1">
                            {dict.inStock}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action controls */}
                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedProduct(p);
                          setActiveImageIndex(0);
                        }}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-slate-150 cursor-pointer"
                        title={isRtl ? 'عرض سريع للمنتج' : 'Quick View details'}
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {(() => {
                        const isWeightedItem = !!(p.isWeighted || p.unitType === 'kg');
                        return (
                          <button
                            onClick={() => {
                              if (isWeightedItem) {
                                setScaleProduct(p);
                                setSelectedPresetGrams(1000);
                                setScaleMode('preset');
                                const basePrice = (p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price) ? p.discountPrice : p.price;
                                setCustomGramsInput('500');
                                setCustomDzdInput(String(Math.round((basePrice * 500) / 1000)));
                              } else {
                                handleAddToCartLocal(p);
                              }
                            }}
                            disabled={p.stock === 0}
                            className={`flex-1 py-2 px-4 rounded-xl text-center text-xs font-bold transition-all shadow-xs cursor-pointer ${
                              p.stock === 0
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : isWeightedItem
                                ? 'bg-amber-600 hover:bg-amber-550 text-white shadow-md shadow-amber-500/10 active:scale-[0.98]'
                                : 'bg-orange-600 hover:bg-orange-550 text-white shadow-md shadow-orange-500/10 hover:shadow-orange-550/20 active:scale-[0.98]'
                            }`}
                          >
                            {p.stock === 0 ? dict.outOfStock : isWeightedItem ? (isRtl ? '⚖️ طلب بالميزان' : '⚖️ Order by Weight') : dict.addToCart}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* QUICK VIEW PRODUCT MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-y-auto max-h-[90vh] animate-slide-up">
            
            <div className="p-6 border-b border-slate-100 bg-slate-50/55 flex justify-between items-center">
              <span className="bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider font-mono">
                {lang === 'ar' ? selectedProduct.categoryAr : selectedProduct.category}
              </span>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="bg-white hover:bg-slate-100 text-slate-500 p-2 rounded-xl transition-all border border-slate-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gallery Section with Multi-Image Support */}
            {(() => {
              const galleryImages = [
                selectedProduct.image,
                ...(selectedProduct.images || [])
              ].filter(Boolean);

              const activeSrc = galleryImages[activeImageIndex] || selectedProduct.image;

              return (
                <div className="space-y-3">
                  <div 
                    className="aspect-video w-full relative bg-slate-50 group/gallery overflow-hidden cursor-zoom-in"
                    onClick={() => setZoomImageSrc(activeSrc)}
                    title={lang === 'ar' ? 'اضغط لتكبير الصورة' : 'Click to zoom image'}
                  >
                    <AnimatePresence mode="popLayout">
                      <motion.img 
                        key={activeImageIndex}
                        src={activeSrc} 
                        alt={lang === 'ar' ? selectedProduct.titleAr : selectedProduct.titleEn} 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                        className="w-full h-full object-cover absolute inset-0"
                        referrerPolicy="no-referrer"
                      />
                    </AnimatePresence>

                    {/* Zoom icon overlay on hover */}
                    <div className="absolute top-3 right-3 bg-white/90 hover:bg-white text-slate-800 p-2 rounded-xl shadow-md transition-all opacity-0 group-hover/gallery:opacity-100 z-10 border border-slate-100 flex items-center gap-1">
                      <Maximize2 className="w-4 h-4 text-slate-600" />
                      <span className="text-[10px] font-bold text-slate-600 px-0.5">
                        {lang === 'ar' ? 'تكبير' : 'Zoom'}
                      </span>
                    </div>

                    {/* Navigation Arrows */}
                    {galleryImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
                          }}
                          className="absolute top-1/2 -translate-y-1/2 left-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all opacity-0 group-hover/gallery:opacity-100 backdrop-blur-xs cursor-pointer text-sm font-bold z-10"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
                          }}
                          className="absolute top-1/2 -translate-y-1/2 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all opacity-0 group-hover/gallery:opacity-100 backdrop-blur-xs cursor-pointer text-sm font-bold z-10"
                        >
                          ›
                        </button>
                      </>
                    )}

                    {/* Image indicator dots */}
                    {galleryImages.length > 1 && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/30 px-2 py-1 rounded-full backdrop-blur-xs z-10">
                        {galleryImages.map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-1.5 h-1.5 rounded-full transition-all ${
                              i === activeImageIndex ? 'bg-orange-500 w-3' : 'bg-white/65'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Thumbnails row */}
                  {galleryImages.length > 1 && (
                    <div className="px-6 flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                      {galleryImages.map((src, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setActiveImageIndex(index)}
                          className={`w-12 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                            index === activeImageIndex 
                              ? 'border-orange-500 scale-95 shadow-xs' 
                              : 'border-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <img 
                            src={src} 
                            alt={`Thumb ${index}`} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="p-6 space-y-4">
              <h3 className="text-xl font-bold text-slate-900 leading-snug">
                {lang === 'ar' ? selectedProduct.titleAr : selectedProduct.titleEn}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed font-sans">
                {lang === 'ar' ? selectedProduct.descriptionAr : selectedProduct.descriptionEn}
              </p>

              <div className="flex justify-between items-center pt-2">
                {selectedProduct.discountPrice && selectedProduct.discountPrice > 0 && selectedProduct.discountPrice < selectedProduct.price ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-slate-400 line-through font-mono">
                        {selectedProduct.price} {lang === 'ar' ? settings.currencyAr : settings.currencyEn}
                      </span>
                      <span className="bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black px-2 py-0.5 rounded-lg">
                        {lang === 'ar' ? 'تخفيض 🔥' : 'SALE 🔥'} -{Math.round(((selectedProduct.price - selectedProduct.discountPrice) / selectedProduct.price) * 100)}%
                      </span>
                    </div>
                    <p className="text-2xl font-black text-rose-600 font-mono leading-none">
                      {selectedProduct.discountPrice} <span className="text-xs font-bold text-emerald-600 font-sans">{lang === 'ar' ? settings.currencyAr : settings.currencyEn}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl font-black text-slate-900 font-mono">
                    {selectedProduct.price} <span className="text-xs font-bold text-emerald-600 font-sans">{lang === 'ar' ? settings.currencyAr : settings.currencyEn}</span>
                  </p>
                )}
                <div>
                  {selectedProduct.stock === 0 ? (
                    <span className="text-rose-650 bg-rose-50 border border-rose-100 text-xs font-bold px-3 py-1.5 rounded-lg">
                      {dict.outOfStock}
                    </span>
                  ) : (
                    <span className="text-slate-500 bg-slate-50 border border-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg">
                      {isRtl ? `المخزون المتوفر: ${selectedProduct.stock} حبة` : `Availability: ${selectedProduct.stock} items`}
                    </span>
                  )}
                </div>
              </div>

              {/* Recipe Quick Banner inside Quick View */}
              {selectedProduct.showRecipeToCustomers !== false && (selectedProduct.recipeAr || selectedProduct.ingredientsAr || selectedProduct.recipeEn || selectedProduct.ingredientsEn) && (
                <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📜</span>
                      <div>
                        <span className="text-xs font-black text-amber-950 block">
                          {isRtl ? 'وصفة ومقادير تحضير هاته الحلوى' : 'Sweets Recipe & Ingredients'}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {selectedProduct.preparationTime && (
                            <span className="text-[10px] text-amber-900 font-bold">
                              ⏱️ {selectedProduct.preparationTime}
                            </span>
                          )}
                          {selectedProduct.difficulty && (
                            <span className="text-[10px] text-amber-900 font-bold">
                              ⭐ {selectedProduct.difficulty === 'easy' ? (isRtl ? 'سهلة' : 'Easy') : selectedProduct.difficulty === 'hard' ? (isRtl ? 'احترافية' : 'Hard') : (isRtl ? 'تقليدية' : 'Medium')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecipeProductModal(selectedProduct)}
                      className="text-xs font-black text-amber-950 bg-amber-200/90 hover:bg-amber-300 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 border border-amber-300 active:scale-95 cursor-pointer shadow-2xs"
                    >
                      <span>{isRtl ? 'عرض الوصفة كاملة 🔍' : 'View Recipe 🔍'}</span>
                    </button>
                  </div>
                  
                  {(selectedProduct.ingredientsAr || selectedProduct.ingredientsEn) && (
                    <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-amber-100">
                      <strong className="text-amber-900 font-bold">{isRtl ? 'المكونات: ' : 'Ingredients: '}</strong>
                      {isRtl ? selectedProduct.ingredientsAr || selectedProduct.ingredientsEn : selectedProduct.ingredientsEn || selectedProduct.ingredientsAr}
                    </p>
                  )}
                </div>
              )}

              {/* Product Ratings and Live Reviews Section */}
              <div className="border-t border-slate-100 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    ⭐ {dict.reviewsTitle} ({selectedProduct.reviews?.length || 0})
                  </h4>
                  {selectedProduct.reviews && selectedProduct.reviews.length > 0 && (
                    <div className="text-[11px] bg-amber-50 text-amber-800 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                      <span>{dict.averageRating}:</span>
                      <span>
                        {(selectedProduct.reviews.reduce((sum, r) => sum + r.rating, 0) / selectedProduct.reviews.length).toFixed(1)} / 5
                      </span>
                    </div>
                  )}
                </div>

                {/* Existing Reviews List */}
                <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                  {!selectedProduct.reviews || selectedProduct.reviews.length === 0 ? (
                    <p className="text-xs text-slate-450 text-center py-2 italic">{dict.noReviews}</p>
                  ) : (
                    selectedProduct.reviews.map((rev) => (
                      <div key={rev.id} className="bg-slate-55 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-extrabold text-slate-750">{rev.userName}</span>
                          <span className="text-slate-400 font-mono">{rev.date}</span>
                        </div>
                        <div className="flex items-center text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className="text-xs">
                              {i < rev.rating ? '★' : '☆'}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed break-words">{rev.comment}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Review Submission Form */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80 space-y-2.5">
                  <h5 className="text-xs font-black text-slate-800">{dict.addReview}</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">{dict.yourName}</label>
                      <input 
                        type="text" 
                        id="rev-user-name" 
                        placeholder={isRtl ? "أدخل اسمك..." : "Your name..."}
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">{dict.ratingLabel}</label>
                      <select 
                        id="rev-rating" 
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-1.5 py-1.5 focus:outline-none focus:border-orange-500 font-sans"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                        <option value="4">⭐⭐⭐⭐ (4)</option>
                        <option value="3">⭐⭐⭐ (3)</option>
                        <option value="2">⭐⭐ (2)</option>
                        <option value="1">⭐ (1)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">{dict.commentLabel}</label>
                    <textarea 
                      id="rev-comment" 
                      rows={2} 
                      placeholder={isRtl ? "اكتب رأيك بأمانة..." : "Write your feedback..."}
                      className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500 resize-none font-sans"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const nameInput = document.getElementById('rev-user-name') as HTMLInputElement;
                      const ratingSelect = document.getElementById('rev-rating') as HTMLSelectElement;
                      const commentText = document.getElementById('rev-comment') as HTMLTextAreaElement;

                      if (!nameInput || !commentText) return;

                      const uName = nameInput.value.trim();
                      const score = Number(ratingSelect.value) || 5;
                      const msg = commentText.value.trim();

                      if (!msg) {
                        alert(isRtl ? 'الرجاء كتابة تعليق أولاً.' : 'Please enter a comment first.');
                        return;
                      }

                      onAddReview(selectedProduct.id, uName, score, msg);

                      // Appending reviews inside local modal state representation dynamically
                      const newRev = {
                        id: `rev-temp-${Date.now()}`,
                        userName: uName || (isRtl ? 'زبون مجهول' : 'Anonymous Guest'),
                        rating: score,
                        comment: msg,
                        date: new Date().toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')
                      };
                      setSelectedProduct({
                        ...selectedProduct,
                        reviews: [newRev, ...(selectedProduct.reviews || [])]
                      });

                      // Clear inputs
                      nameInput.value = '';
                      ratingSelect.value = '5';
                      commentText.value = '';
                    }}
                    className="w-full py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition"
                  >
                    {dict.submitReview}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-bold transition-all border border-slate-150"
                >
                  {dict.close}
                </button>
                {(() => {
                  const isWeighted = !!(selectedProduct.isWeighted || selectedProduct.unitType === 'kg');
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (isWeighted) {
                          const p = selectedProduct;
                          setSelectedProduct(null);
                          setScaleProduct(p);
                          setSelectedPresetGrams(1000);
                          setScaleMode('preset');
                          const basePrice = (p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price) ? p.discountPrice : p.price;
                          setCustomGramsInput('500');
                          setCustomDzdInput(String(Math.round((basePrice * 500) / 1000)));
                        } else {
                          handleAddToCartLocal(selectedProduct);
                          setSelectedProduct(null);
                        }
                      }}
                      disabled={selectedProduct.stock === 0}
                      className={`w-2/3 py-2.5 rounded-xl text-center text-xs font-bold transition-all shadow-md cursor-pointer ${
                        selectedProduct.stock === 0
                          ? 'bg-slate-200 text-slate-405 cursor-not-allowed'
                          : isWeighted
                          ? 'bg-amber-600 hover:bg-amber-550 text-white shadow-amber-500/10 active:scale-[0.98]'
                          : 'bg-orange-600 hover:bg-orange-550 text-white shadow-orange-500/10 hover:shadow-orange-500/20 active:scale-[0.98]'
                      }`}
                    >
                      {selectedProduct.stock === 0 ? dict.outOfStock : isWeighted ? (isRtl ? '⚖️ طلب بالميزان' : '⚖️ Order by Weight') : dict.addToCart}
                    </button>
                  );
                })()}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* WEIGHT / SCALE SELECTION MODAL FOR SWEETS */}
      {scaleProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-amber-200 shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl">
                  ⚖️
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                    {isRtl ? 'طلب بالوزن والميزان (الحلويات)' : 'Order by Weight (Sweets)'}
                  </h3>
                  <p className="text-amber-100 text-xs">
                    {isRtl ? 'حدد الوزن بالكيلوغرام أو الغرام أو بالمبلغ بالدينار' : 'Specify weight in kg, grams, or amount in DZD'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setScaleProduct(null)}
                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
              {/* Product Info Card */}
              <div className="flex items-center gap-4 bg-amber-50/80 p-4 rounded-2xl border border-amber-200/80">
                <img
                  src={scaleProduct.image}
                  alt={isRtl ? scaleProduct.titleAr : scaleProduct.titleEn}
                  className="w-16 h-16 rounded-xl object-cover border border-amber-200 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-slate-900 text-base truncate">
                    {isRtl ? scaleProduct.titleAr : scaleProduct.titleEn}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-md font-mono">
                      {isRtl ? 'سعر الكيلو:' : 'Price / kg:'} {(scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price} {isRtl ? settings.currencyAr : settings.currencyEn} / 1 {isRtl ? 'كغ' : 'kg'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-2.5">
                  {isRtl ? '🎯 الأوزان السريعة المتاحة:' : '🎯 Quick Weight Presets:'}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { grams: 500, labelAr: 'نصف كيلو (0.5 كغ)', labelEn: '0.5 kg (500g)' },
                    { grams: 1000, labelAr: '1 كيلو (1 كغ)', labelEn: '1.0 kg (1000g)' },
                    { grams: 2000, labelAr: '2 كيلو (2 كغ)', labelEn: '2.0 kg (2000g)' },
                  ].map((preset) => {
                    const basePrice = (scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price;
                    const presetCost = Math.round((basePrice * preset.grams) / 1000);
                    const isSelected = selectedPresetGrams === preset.grams && scaleMode === 'preset';
                    return (
                      <button
                        key={preset.grams}
                        type="button"
                        onClick={() => {
                          setSelectedPresetGrams(preset.grams);
                          setScaleMode('preset');
                          setCustomGramsInput(String(preset.grams));
                          setCustomDzdInput(String(presetCost));
                        }}
                        className={`p-3 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-md font-black scale-102'
                            : 'bg-white border-slate-200 hover:border-amber-400 text-slate-800'
                        }`}
                      >
                        <span className="text-xs font-black">{isRtl ? preset.labelAr : preset.labelEn}</span>
                        <span className={`text-xs font-mono font-extrabold ${isSelected ? 'text-slate-950' : 'text-amber-600'}`}>
                          {presetCost} {isRtl ? settings.currencyAr : settings.currencyEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Weight / Custom Price Toggle & Inputs */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="text-xs font-black text-slate-800">
                    {isRtl ? '⚙️ أو أدخل وزناً مخصصاً أو مبلغاً بالدينار:' : '⚙️ Or enter custom weight or amount:'}
                  </span>
                  <div className="flex bg-slate-200/70 p-1 rounded-xl text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setScaleMode('custom_grams')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        scaleMode === 'custom_grams' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {isRtl ? 'بالغرام' : 'Grams'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScaleMode('custom_price')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        scaleMode === 'custom_price' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {isRtl ? 'بالدينار (د.ج)' : 'In DZD'}
                    </button>
                  </div>
                </div>

                {/* Option A: Custom Grams Input */}
                {scaleMode === 'custom_grams' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {isRtl ? 'أدخل الوزن المطلوب بالغرام (مثال: 750غ = ثلاث أرباع كيلو):' : 'Enter requested weight in grams (e.g. 750g):'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={50}
                          step={25}
                          value={customGramsInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomGramsInput(val);
                            const grams = Number(val) || 0;
                            const basePrice = (scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price;
                            setCustomDzdInput(String(Math.round((basePrice * grams) / 1000)));
                          }}
                          placeholder="750"
                          className="w-full bg-white border border-amber-300 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-xs"
                        />
                        <span className="absolute left-3 top-3 text-xs font-bold text-slate-400 font-mono">
                          {isRtl ? 'غرام (غ)' : 'Grams (g)'}
                        </span>
                      </div>
                    </div>

                    {/* Quick Increment Buttons */}
                    <div className="flex gap-2 pt-1">
                      {[100, 250, 500, 750].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            setCustomGramsInput(String(g));
                            const basePrice = (scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price;
                            setCustomDzdInput(String(Math.round((basePrice * g) / 1000)));
                          }}
                          className="flex-1 py-1.5 bg-white border border-slate-200 hover:border-amber-400 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer"
                        >
                          +{g}غ
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Option B: Custom Price Input in DZD */}
                {scaleMode === 'custom_price' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {isRtl ? 'أدخل المبلغ المطلوب الشراء به بالدينار (مثال: 1350 د.ج):' : 'Enter amount you wish to spend in DZD:'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={100}
                          step={50}
                          value={customDzdInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomDzdInput(val);
                            const dzd = Number(val) || 0;
                            const basePrice = (scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price;
                            if (basePrice > 0) {
                              const calculatedGrams = Math.round((dzd / basePrice) * 1000);
                              setCustomGramsInput(String(calculatedGrams));
                            }
                          }}
                          placeholder="1350"
                          className="w-full bg-white border border-amber-300 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-xs"
                        />
                        <span className="absolute left-3 top-3 text-xs font-bold text-slate-400 font-mono">
                          {isRtl ? settings.currencyAr : settings.currencyEn}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Digital Scale Result */}
              {(() => {
                const basePrice = (scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price;
                let activeGrams = 1000;
                if (scaleMode === 'preset') {
                  activeGrams = selectedPresetGrams;
                } else {
                  activeGrams = Number(customGramsInput) || 0;
                }
                const calculatedPrice = Math.round((basePrice * activeGrams) / 1000);
                const weightTextFormatted = formatWeightText(activeGrams, isRtl);

                return (
                  <div className="bg-slate-900 text-white rounded-2xl p-4 border border-amber-500/40 shadow-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-amber-400 font-mono uppercase tracking-widest block font-bold">
                        {isRtl ? '⚖️ النتيجة في الميزان الرقمي' : '⚖️ Digital Scale Result'}
                      </span>
                      <span className="text-xl font-black text-white block mt-0.5 font-mono">
                        {weightTextFormatted}
                      </span>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest block font-bold">
                        {isRtl ? 'السعر المحسوب' : 'Total Cost'}
                      </span>
                      <span className="text-2xl font-black text-amber-400 font-mono">
                        {calculatedPrice} <span className="text-xs text-white">{isRtl ? settings.currencyAr : settings.currencyEn}</span>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Add To Cart Action */}
              {(() => {
                const basePrice = (scaleProduct.discountPrice && scaleProduct.discountPrice > 0 && scaleProduct.discountPrice < scaleProduct.price) ? scaleProduct.discountPrice : scaleProduct.price;
                let activeGrams = 1000;
                if (scaleMode === 'preset') {
                  activeGrams = selectedPresetGrams;
                } else {
                  activeGrams = Number(customGramsInput) || 0;
                }
                const calculatedPrice = Math.round((basePrice * activeGrams) / 1000);
                const weightTextFormatted = formatWeightText(activeGrams, isRtl);

                return (
                  <button
                    type="button"
                    disabled={activeGrams <= 0}
                    onClick={() => {
                      handleAddToCartLocal(scaleProduct, activeGrams, weightTextFormatted);
                      setScaleProduct(null);
                    }}
                    className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black rounded-2xl text-sm transition-all shadow-lg hover:shadow-xl active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>🛒 {isRtl ? `تأكيد وإضافة للسلة: ${weightTextFormatted} (${calculatedPrice} ${settings.currencyAr})` : `Add to Cart: ${weightTextFormatted} (${calculatedPrice} ${settings.currencyEn})`}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SHOPPING CART DRAWER / SIDE BAR */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setShowCartDrawer(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          ></div>

          {/* Drawer content (aligned with dir) */}
          <div className="bg-white max-w-md w-full h-full shadow-2xl relative z-10 flex flex-col justify-between animate-slide-left p-6">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-6 border-b border-orange-100/40">
              <div className="flex items-center gap-2 text-slate-900">
                <CartIcon className="w-5 h-5 text-orange-600" />
                <h3 className="font-extrabold text-lg">{dict.cart}</h3>
              </div>
              <button 
                onClick={() => setShowCartDrawer(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-2 rounded-xl transition-all border border-slate-150 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart body items */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                  <CartIcon className="w-12 h-12 text-slate-200 mx-auto opacity-70" />
                  <p className="text-slate-450 text-sm max-w-[200px] mx-auto font-sans">
                    {dict.cartEmpty}
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const displayTitle = lang === 'ar' ? item.product.titleAr : item.product.titleEn;
                  const itemKey = `${item.product.id}_${item.selectedWeightGrams || 0}`;
                  const p = item.product;
                  const basePrice = (p.discountPrice !== undefined && p.discountPrice > 0 && p.discountPrice < p.price) ? p.discountPrice : p.price;
                  const itemUnitPrice = item.selectedWeightGrams 
                    ? Math.round((basePrice * item.selectedWeightGrams) / 1000)
                    : (item.calculatedUnitPrice || basePrice);

                  return (
                    <div key={itemKey} className="flex gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-150 transition-all relative">
                      <img 
                        src={item.product.image} 
                        alt={displayTitle} 
                        className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <h4 className="font-bold text-slate-900 truncate pr-5">{displayTitle}</h4>
                        
                        {item.customWeightText && (
                          <div className="my-0.5">
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-md">
                              ⚖️ {item.customWeightText}
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-slate-500 font-mono">
                          <span className="font-bold text-slate-900">
                            {itemUnitPrice} {lang === 'ar' ? settings.currencyAr : settings.currencyEn}
                          </span>
                          <span className="text-slate-400 mx-1">×</span>
                          <span>{item.quantity}</span>
                          <span className="text-slate-400 mx-1">=</span>
                          <span className="font-black text-orange-600">
                            {itemUnitPrice * item.quantity} {lang === 'ar' ? settings.currencyAr : settings.currencyEn}
                          </span>
                        </p>
                        
                        {/* Adjust qty buttons */}
                        <div className="flex items-center gap-1 mt-2">
                          <button
                            onClick={() => onUpdateCartQty(item.product.id, item.quantity - 1, item.selectedWeightGrams)}
                            className="p-1 bg-white hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200/80 transition-all cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 py-0.5 bg-white border border-slate-200 text-xs font-bold font-mono rounded-md">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateCartQty(item.product.id, item.quantity + 1, item.selectedWeightGrams)}
                            className="p-1 bg-white hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200/80 transition-all cursor-pointer"
                            disabled={item.quantity >= item.product.stock}
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Trash icon */}
                      <button
                        onClick={() => onRemoveFromCart(item.product.id, item.selectedWeightGrams)}
                        className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-rose-600 transition-all bg-white hover:bg-rose-50 border border-slate-200/60 hover:border-rose-100 rounded-lg cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Summary & checkout */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="text-slate-500">{dict.total}:</span>
                <span className="text-xl font-black text-slate-905 font-mono">
                  {cartTotal} {lang === 'ar' ? settings.currencyAr : settings.currencyEn}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCartDrawer(false)}
                  className="w-1/3 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-650 rounded-xl text-xs font-bold transition-all"
                >
                  {isRtl ? 'واصل التسوق' : 'Continue Shopping'}
                </button>
                <button
                  onClick={() => {
                    if (cart.length > 0) {
                      setShowCartDrawer(false);
                      setShowCheckoutModal(true);
                    }
                  }}
                  disabled={cart.length === 0}
                  className={`w-2/3 py-3 rounded-xl text-center text-xs font-bold transition-all shadow-md cursor-pointer ${
                    cart.length === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-orange-600 hover:bg-orange-550 text-white shadow-orange-500/10 hover:shadow-orange-500/20 active:scale-[0.98]'
                  }`}
                >
                  {dict.checkout}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CHECKOUT & ADDRESS INPUT FORM MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden animate-slide-up">
            
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-orange-600" />
                <h3 className="font-extrabold text-slate-900">{dict.checkoutTitle}</h3>
              </div>
              <button 
                onClick={() => setShowCheckoutModal(false)}
                className="bg-white hover:bg-slate-100 text-slate-505 p-2 rounded-xl transition-all border border-slate-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1 justify-start">
                  <User className="w-3.5 h-3.5" />
                  <span>{dict.fullName}</span>
                </label>
                <input 
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={isRtl ? 'مثل: محمد بن صالح الغامدي' : 'e.g. John Doe'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1 justify-start">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{dict.phoneNumber}</span>
                </label>
                <input 
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-450 focus:outline-none focus:border-orange-500 font-mono text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1 justify-start">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{dict.address}</span>
                </label>
                <input 
                  type="text"
                  required
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder={isRtl ? 'المنطقة، المدينة، اسم الحي، الشارع ورقم المنزل' : 'City, Neighborhood, Street name'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1 justify-start">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{dict.email} {isRtl ? '(اختياري)' : '(Optional)'}</span>
                </label>
                <input 
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-450 focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-bold transition-all border border-slate-150 cursor-pointer"
                >
                  {dict.cancel}
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-orange-600 hover:bg-orange-550 text-white rounded-xl text-xs font-bold transition-all shadow-md focus:outline-none cursor-pointer"
                >
                  {dict.placeOrder}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* PLACED ORDER SUCCESS MODAL FOR RECEIPT DOWNLOADING */}
      {placedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl p-8 text-center animate-slide-up relative">
            
            <div className="w-16 h-16 bg-emerald-55 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 animate-bounce" />
            </div>

            <h3 className="text-xl font-bold text-slate-900">
              {dict.orderSuccess}
            </h3>
            
            <p className="text-slate-500 text-xs mt-2 font-sans">
              {isRtl 
                ? 'لقد تم تدوين طلبك في النظام بنجاح، يمكنك النقر على الزر في الأسفل لتحميل الفاتورة وتتبعها مع الإدارة في أي وقت.'
                : 'Your transaction has been written safely in our servers. Click download invoice button below to store it locally.'}
            </p>

            <div className="bg-slate-50 rounded-xl p-4 my-6 text-sm flex items-center justify-between border border-slate-200/65 font-mono">
              <span className="text-slate-400 font-sans">{dict.orderNumber}:</span>
              <span className="font-bold text-slate-850">#{placedOrder.id.slice(0, 10).toUpperCase()}</span>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => handleDownloadInvoice(placedOrder)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md focus:outline-none cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{dict.downloadInvoice}</span>
              </button>

              <button
                onClick={() => handleMiniThermalPrint(placedOrder)}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all shadow-md focus:outline-none cursor-pointer"
              >
                <span>📱</span>
                <span>{isRtl ? 'طباعة تيكيت ميني حراري 📱' : 'Print Mini Ticket 📱'}</span>
              </button>

              <button
                onClick={() => setPlacedOrder(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-bold transition-all border border-slate-150 cursor-pointer"
              >
                {dict.close}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* LIVE ORDER TRACKING MODAL */}
      {showTrackingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-slate-800">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl p-6 md:p-8 animate-slide-up relative max-h-[90vh] overflow-y-auto">
            
            <button
              type="button"
              onClick={() => setShowTrackingModal(false)}
              className="absolute top-4 left-4 text-slate-450 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 bg-orange-55 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-slate-909 text-slate-900">
                {dict.trackOrderTitle}
              </h3>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                {dict.trackOrderPlaceholder}
              </p>
            </div>

            {/* Input Search Form */}
            <div className="flex gap-2 mb-6">
              <input 
                type="text"
                value={trackingQuery}
                onChange={(e) => setTrackingQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    performTrackingSearch();
                  }
                }}
                placeholder={isRtl ? "أدخل رقم الهاتف المحمول أو معرف الطلب..." : "Enter phone number or Order ID..."}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500 font-sans"
              />
              <button
                type="button"
                onClick={performTrackingSearch}
                disabled={isSearchingTrack}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md focus:outline-none flex-shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isSearchingTrack ? (isRtl ? 'جاري البحث...' : 'Searching...') : dict.trackOrderBt}
              </button>
            </div>

            {/* Tracking Results Area */}
            <div className="space-y-4">
              {hasSearchedTrack && (!trackedOrders || trackedOrders.length === 0) && (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100 animate-fade-in">
                  <p className="text-sm font-semibold text-rose-650">{dict.orderNotFound}</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">
                    {isRtl ? 'الرجاء التأكد من المطابقة والمحاولة مرة أخرى بحرص.' : 'Please crosscheck spelling or phone credentials.'}
                  </p>
                </div>
              )}

              {trackedOrders && trackedOrders.length > 0 && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dict.orderStatusTrack} ({trackedOrders.length})</p>
                  
                  {trackedOrders.map((ord) => {
                    const orderStatus = ord.status || 'pending';
                    
                    // Style status badge
                    let badgeColors = 'bg-amber-50 text-amber-800 border-amber-200';
                    let statusPhrase = isRtl ? 'بانتظار المراجعة والتحضير' : 'Pending Review';
                    if (orderStatus === 'shipped') {
                      badgeColors = 'bg-blue-50 text-blue-800 border-blue-200';
                      statusPhrase = isRtl ? 'تم الشحن ونقل الشحنة' : 'Shipped';
                    } else if (orderStatus === 'delivered') {
                      badgeColors = 'bg-orange-50 text-orange-850 border-orange-200';
                      statusPhrase = isRtl ? 'تم التوصيل بنجاح وبأمان' : 'Delivered';
                    } else if (orderStatus === 'cancelled') {
                      badgeColors = 'bg-rose-50 text-rose-800 border-rose-200';
                      statusPhrase = isRtl ? 'تم إلغاء الطلب' : 'Cancelled';
                    }

                    return (
                      <div key={ord.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 hover:border-slate-300 transition animate-fade-in font-sans">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">ID: #{ord.id.slice(0, 10).toUpperCase()}</span>
                            <h4 className="font-bold text-slate-805 text-xs mt-0.5">{ord.customerName}</h4>
                          </div>
                          <span className={`px-2 py-0.5 text-[11px] font-bold border rounded-lg ${badgeColors}`}>
                            {statusPhrase}
                          </span>
                        </div>

                        {/* Items list summary */}
                        <div className="border-t border-slate-200/65 pt-2">
                          <div className="space-y-1">
                            {ord.items.map((item, index) => (
                              <div key={index} className="flex justify-between text-[11px] text-slate-600">
                                <span className="truncate max-w-[200px]">{isRtl ? item.titleAr : item.titleEn}</span>
                                <span className="font-mono text-[11px] font-bold">×{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-slate-200/65 pt-2 flex justify-between items-center text-[11px] flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-mono me-1">{ord.date}</span>
                            <button
                              type="button"
                              onClick={() => handleDownloadInvoice(ord)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                              title={isRtl ? 'طباعة الفاتورة الكاملة' : 'Print Full Invoice'}
                            >
                              <span>📄</span>
                              <span>{isRtl ? 'فاتورة' : 'Invoice'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMiniThermalPrint(ord)}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-black transition flex items-center gap-1 shadow-2xs cursor-pointer"
                              title={isRtl ? 'طباعة تيكيت ميني مباشرة بالطابعة الحرارية' : 'Print Mini Ticket'}
                            >
                              <span>📱</span>
                              <span>{isRtl ? 'تيكيت ميني' : 'Mini Ticket'}</span>
                            </button>
                          </div>
                          <span className="font-extrabold text-slate-800">
                            {isRtl ? 'الإجمالي:' : 'Total:'}{' '}
                            <span className="text-orange-600 font-mono font-black">{ord.total} {isRtl ? settings.currencyAr : settings.currencyEn}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 mt-6 font-sans">
              <button
                type="button"
                onClick={() => setShowTrackingModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-605 rounded-xl text-xs font-bold transition-all border border-slate-150"
              >
                {dict.close}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FOOTER SECTION */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800 mt-20 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-white font-bold">{isRtl ? settings.storeNameAr : settings.storeNameEn}</p>
              <p className="text-xs mt-1 text-slate-450">
                {isRtl ? `بإشراف: ${settings.ownerNameAr} • هاتف: ${settings.ownerPhone} • بريد: ${settings.ownerEmail}` : `Managed by: ${settings.ownerNameEn} • Phone: ${settings.ownerPhone} • Email: ${settings.ownerEmail}`}
              </p>
            </div>
            <div className="text-xs gap-4 flex flex-wrap justify-center sm:justify-end">
              <span>{isRtl ? 'شحن فوري وبأمان' : 'Secure Delivery'}</span>
              <span>{isRtl ? 'سياسة الخصوصية' : 'Privacy Code'}</span>
              <span>{isRtl ? 'شروط الاستخدام' : 'Terms of Service'}</span>
            </div>
          </div>
          <div className="h-px bg-slate-800"></div>
          <p className="text-center text-[10px] text-slate-600 font-mono">
            © 2026 {isRtl ? settings.storeNameAr : settings.storeNameEn} • {isRtl ? 'صُنع بحب وعناية فائقة' : 'Developed beautifully with complete localized persistence'}
          </p>
        </div>
      </footer>

      {/* LUXURIOUS SUCCESS NOTIFICATION TOAST */}
      {showToast && latestAddedItem && (
        <div 
          className="fixed bottom-6 right-6 left-6 md:left-auto md:w-[380px] bg-slate-900 text-white rounded-3xl p-4 shadow-2xl border border-slate-800 flex flex-col gap-3 z-50 animate-toast"
          style={{ direction: isRtl ? 'rtl' : 'ltr' }}
        >
          <div className="flex items-center gap-3">
            {/* Image */}
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 relative border border-slate-700">
              <img 
                src={latestAddedItem.image} 
                alt="" 
                className="w-full h-full object-contain p-[3%]"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Metadata info */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-orange-400 font-extrabold uppercase tracking-wider flex items-center gap-1 justify-start">
                <span>✨</span>
                <span>{isRtl ? 'تم إضافة المنتج بنجاح!' : 'Added Successfully!'}</span>
              </p>
              <h4 className="font-bold text-xs truncate mt-0.5 text-white">
                {lang === 'ar' ? latestAddedItem.titleAr : latestAddedItem.titleEn}
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {isRtl ? 'تم إضافة المنتج بنجاح إلى سلة الشراء الخاصة بك.' : 'Has been placed elegantly in your order.'}
              </p>
            </div>
            {/* Cross check */}
            <button 
              onClick={() => setShowToast(false)}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-800/80 pt-2.5">
            <button
              onClick={() => {
                setShowToast(false);
                setShowCartDrawer(true);
              }}
              className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-550 text-white rounded-xl text-[11px] font-black tracking-wide text-center transition cursor-pointer"
            >
              {isRtl ? 'عرض السلة والتأكيد 🛒' : 'View Basket & Checkout 🛒'}
            </button>
            <button
              onClick={() => setShowToast(false)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold text-center transition cursor-pointer"
            >
              {isRtl ? 'إغلاق' : 'Dismiss'}
            </button>
          </div>

          {/* Timeline progress line bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden absolute bottom-0 left-0 right-0">
            <div  
              className="h-full bg-orange-500 transition-all duration-[20ms] ease-linear"
              style={{ width: `${addedItemTimer}%` }}
            />
          </div>
        </div>
      )}

      {/* BARCODE SCANNER feedback toast notification */}
      {scanToast && (
        <div 
          className={`fixed bottom-6 right-6 left-6 md:left-auto md:w-[380px] rounded-3xl p-4.5 shadow-2xl border flex flex-col gap-2 z-50 animate-toast ${
            scanToast.type === 'success' 
              ? 'bg-emerald-900 border-emerald-800 text-emerald-100' 
              : 'bg-rose-900 border-rose-800 text-rose-100'
          }`}
          style={{ direction: isRtl ? 'rtl' : 'ltr' }}
        >
          <div className="flex items-start gap-3 text-right">
            <span className="text-lg shrink-0 mt-0.5">
              {scanToast.type === 'success' ? '🎯' : '⚠️'}
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-xs text-white">
                {isRtl ? 'الماسح الضوئي للباركود' : 'Barcode POS Decoder'}
              </h4>
              <p className="text-[11px] mt-1.5 leading-relaxed text-slate-100 font-semibold">
                {scanToast.message}
              </p>
            </div>
            <button 
              onClick={() => setScanToast(null)}
              className="p-1 text-slate-300 hover:text-white rounded-lg transition shrink-0 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* BARCODE SCANNER OVERLAY FOR CUSTOMER STOREFRONT */}
      <BarcodeScannerModal
        isOpen={isStorefrontScannerOpen}
        onClose={() => setIsStorefrontScannerOpen(false)}
        onScanSuccess={handleBarcodeScanSuccess}
        products={products}
        lang={lang}
      />

      {/* FULLSCREEN IMAGE LIGHTBOX WITH ZOOM & PAN */}
      <AnimatePresence>
        {zoomImageSrc && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-slate-950/98 flex flex-col items-center justify-between z-[100] backdrop-blur-md overflow-hidden select-none"
            style={{ direction: isRtl ? 'rtl' : 'ltr' }}
          >
            {/* Top Bar with title and Close button */}
            <div className="w-full bg-gradient-to-b from-black/80 to-transparent p-6 flex justify-between items-center z-10">
              <div className="text-white/90 text-sm font-bold flex items-center gap-2">
                <span className="bg-orange-600 w-2 h-2 rounded-full animate-pulse" />
                {lang === 'ar' ? 'عرض تفصيلي مكبّر' : 'Detailed Zoom View'}
              </div>
              <button 
                type="button"
                onClick={() => {
                  setZoomImageSrc(null);
                  handleZoomReset();
                }}
                className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-2xl transition-all border border-white/10 flex items-center justify-center cursor-pointer"
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Interactive Workspace */}
            <div 
              className="flex-1 w-full flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUpOrLeave}
            >
              <div 
                style={{
                  transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomScale})`,
                  transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                }}
                className="max-w-[90%] max-h-[80vh] flex items-center justify-center pointer-events-none select-none origin-center"
              >
                <img 
                  src={zoomImageSrc} 
                  alt="Zoomed detailed image" 
                  className="max-w-full max-h-full object-contain rounded-2xl pointer-events-none select-none shadow-2xl"
                  onDoubleClick={handleImageDoubleClick}
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Instructions badge */}
              <div className="absolute bottom-6 left-4 right-4 pointer-events-none flex justify-center z-15">
                <div className="bg-black/60 text-white/80 text-[10px] sm:text-xs font-bold px-4 py-1.5 rounded-full backdrop-blur-xs shadow-xs uppercase tracking-wider text-center">
                  {lang === 'ar' ? 'اسحب للتحرير • نقر مزدوج للتكبير/التصغير' : 'Drag to pan • Double click to toggle zoom'}
                </div>
              </div>
            </div>

            {/* Floating Zoom Controls Bar */}
            <div className="w-full bg-gradient-to-t from-black/80 to-transparent p-6 pb-8 flex flex-col items-center gap-3 z-10">
              <div className="bg-slate-900/90 border border-white/10 px-5 py-3 rounded-2xl flex items-center gap-5 backdrop-blur-md shadow-2xl">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomScale <= 1}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    zoomScale <= 1 
                      ? 'bg-slate-850 text-slate-600 cursor-not-allowed' 
                      : 'bg-white/10 hover:bg-white/20 text-white cursor-pointer active:scale-95'
                  }`}
                  title={lang === 'ar' ? 'تصغير' : 'Zoom Out'}
                >
                  <ZoomOut className="w-5 h-5" />
                </button>

                <div className="text-white font-mono text-sm font-bold min-w-[50px] text-center">
                  {Math.round(zoomScale * 100)}%
                </div>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomScale >= 4}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    zoomScale >= 4 
                      ? 'bg-slate-850 text-slate-600 cursor-not-allowed' 
                      : 'bg-white/10 hover:bg-white/20 text-white cursor-pointer active:scale-95'
                  }`}
                  title={lang === 'ar' ? 'تكبير' : 'Zoom In'}
                >
                  <ZoomIn className="w-5 h-5" />
                </button>

                {zoomScale > 1 && (
                  <div className="h-6 w-px bg-white/15" />
                )}

                {zoomScale > 1 && (
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/35 text-orange-400 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    {lang === 'ar' ? 'إعادة تعيين' : 'Reset'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRINTER PAIRING GUIDE MODAL */}
      <PrinterPairingModal
        isOpen={showPrinterPairingGuide}
        onClose={() => setShowPrinterPairingGuide(false)}
        lang={lang}
      />

      {/* MINI TICKET IMAGE MODAL */}
      <MiniTicketModal
        order={miniTicketOrder}
        settings={settings}
        products={products}
        lang={lang}
        isOpen={!!miniTicketOrder}
        onClose={() => setMiniTicketOrder(null)}
      />

    </div>
  );
}
