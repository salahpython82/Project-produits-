import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  Plus, 
  Edit, 
  Trash2, 
  Download, 
  TrendingUp, 
  LogOut, 
  ShoppingBag, 
  Boxes, 
  CheckCircle2, 
  X,
  RefreshCw,
  Search,
  Eye,
  Upload,
  Image as ImageIcon,
  Star,
  MessageSquare,
  Printer,
  Coins,
  Percent,
  Bell,
  Smartphone
} from 'lucide-react';
import { Product, Order, Language, TranslationDictionary, StoreSettings, ProductReview, StaffMember } from '../types';
import { BarcodeSVG } from './BarcodeSVG';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { getBarcodeSVGString } from '../lib/invoiceBarcode';
import { checkNotificationPermission, requestNotificationPermission, sendTestNotification } from '../lib/notifications';
import { openPrintInvoice, openMiniThermalPrint } from '../lib/invoicePrinter';
import { PrinterPairingModal } from './PrinterPairingModal';
import { MiniTicketModal } from './MiniTicketModal';

interface AdminPanelProps {
  products: Product[];
  orders: Order[];
  staff?: StaffMember[];
  onAddStaff?: (newStaff: StaffMember) => Promise<void> | void;
  onDeleteStaff?: (staffId: string) => Promise<void> | void;
  onAddProduct: (product: Omit<Product, 'id'>) => Promise<void> | void;
  onEditProduct: (id: string, updated: Partial<Product>) => Promise<void> | void;
  onDeleteProduct: (id: string) => Promise<void> | void;
  onSeedDefaultProducts?: () => Promise<void> | void;
  onDeleteOrder: (id: string) => Promise<void> | void;
  onUpdateOrderStatus: (orderId: string, status: Order['status']) => Promise<void> | void;
  settings: StoreSettings;
  onUpdateSettings: (newSettings: StoreSettings) => Promise<void> | void;
  lang: Language;
  dict: TranslationDictionary;
  onClose: () => void;
  currentUser: any;
  onLoginGoogle: () => Promise<void>;
  onLogoutGoogle: () => Promise<void>;
}

export default function AdminPanel({
  products,
  orders,
  staff = [],
  onAddStaff,
  onDeleteStaff,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onSeedDefaultProducts,
  onDeleteOrder,
  onUpdateOrderStatus,
  settings,
  onUpdateSettings,
  lang,
  dict,
  onClose,
  currentUser,
  onLoginGoogle,
  onLogoutGoogle
}: AdminPanelProps) {
  // Core RTL configuration and Error parsing helpers
  const isRtl = lang === 'ar';
  
  const getErrorDescription = (err: any): string => {
    if (err && err.message) {
      if (err.message.includes('⚠️')) {
        return err.message;
      }
      if (err.message.startsWith('{')) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error && (parsed.error.includes('permission-denied') || parsed.error.includes('Permission denied') || parsed.error.includes('Missing or insufficient permissions'))) {
            return isRtl 
              ? '⚠️ لا تمتلك الصلاحيات الكافية للتعديل على قاعدة البيانات (Firebase Permission Denied). يرجى التأكد من تسجيل الدخول بحساب Google المسؤول: salahbousbia82@gmail.com'
              : '⚠️ Permission Denied: You do not have write permissions to the database. Please ensure you are logged in with the Google Admin account: salahbousbia82@gmail.com';
          }
          return parsed.error || err.message;
        } catch {
          return err.message;
        }
      }
      return err.message;
    }
    return String(err);
  };

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [adminRole, setAdminRole] = useState<'super' | 'staff' | null>(null);
  const [loggedStaffMember, setLoggedStaffMember] = useState<StaffMember | null>(null);

  // Action loading / error tracking states
  const [isAdminActionLoading, setIsAdminActionLoading] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Store Customization properties
  const [storeNameAr, setStoreNameAr] = useState<string>(settings.storeNameAr);
  const [storeNameEn, setStoreNameEn] = useState<string>(settings.storeNameEn);
  const [ownerNameAr, setOwnerNameAr] = useState<string>(settings.ownerNameAr);
  const [ownerNameEn, setOwnerNameEn] = useState<string>(settings.ownerNameEn);
  const [ownerPhone, setOwnerPhone] = useState<string>(settings.ownerPhone);
  const [ownerEmail, setOwnerEmail] = useState<string>(settings.ownerEmail);
  const [logoUrl, setLogoUrl] = useState<string>(settings.logoUrl);
  const [currencyAr, setCurrencyAr] = useState<string>(settings.currencyAr || 'ر.س');
  const [currencyEn, setCurrencyEn] = useState<string>(settings.currencyEn || 'SAR');
  const [promoMsgAr, setPromoMsgAr] = useState<string>(settings.promoMsgAr || '🎉 شحن مجاني لأول ثلاثة طلبات فوق 400 د.ج! كود الكوبون: WELCOME');
  const [promoMsgEn, setPromoMsgEn] = useState<string>(settings.promoMsgEn || '🎉 Free Shipping on your first 3 orders above 400 DZD! Promo code: WELCOME');
  const [bioAr, setBioAr] = useState<string>(settings.bioAr || 'مرحباً بك في وجهتك الأولى للحصول على أجود منتجات البن والملابس والكتب والإلكترونيات منتقاة بعناية. الموقع مجهز بالكامل بنظام فوترة الرمز الشريطي (الباركود) المتطور لمسح وإضافة السلع بلمح البصر.');
  const [bioEn, setBioEn] = useState<string>(settings.bioEn || 'Browse our signature collection of gourmet coffee, wool apparel, smart electronics, and books. Scan barcodes directly through your camera or handheld scanner for express checkout.');
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);
  const [notificationStatus, setNotificationStatus] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');

  // Tab state: 'stats' | 'products' | 'orders' | 'settings' | 'reviews' | 'staff' | 'sales_report'
  const [activeTab, setActiveTab] = useState<'stats' | 'products' | 'orders' | 'settings' | 'reviews' | 'staff' | 'sales_report'>('stats');

  const [timeFilter, setTimeFilter] = useState<'weekly' | 'monthly' | 'yearly' | 'all'>('weekly');
  const [statsSearchTerm, setStatsSearchTerm] = useState<string>('');
  const [statsSortKey, setStatsSortKey] = useState<'qty' | 'revenue' | 'profit'>('revenue');

  // Reviews filter & search states
  const [reviewSearchTerm, setReviewSearchTerm] = useState<string>('');
  const [reviewRatingFilter, setReviewRatingFilter] = useState<number | 'all' | 'critical'>('all');

  // Product modal state
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Product Form states
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [recipeAr, setRecipeAr] = useState('');
  const [recipeEn, setRecipeEn] = useState('');
  const [ingredientsAr, setIngredientsAr] = useState('');
  const [ingredientsEn, setIngredientsEn] = useState('');
  const [preparationTime, setPreparationTime] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [showRecipeToCustomers, setShowRecipeToCustomers] = useState<boolean>(true);
  const [price, setPrice] = useState<number>(0);
  const [discountPrice, setDiscountPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [category, setCategory] = useState('electronics');
  const [isWeighted, setIsWeighted] = useState<boolean>(false);
  const [image, setImage] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isAdminScannerOpen, setIsAdminScannerOpen] = useState(false);
  const [imageInputMethod, setImageInputMethod] = useState<'upload' | 'url'>('upload');
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Multiple images state
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [additionalImageInputMethod, setAdditionalImageInputMethod] = useState<'upload' | 'url'>('upload');
  const [isUploadingAddImage, setIsUploadingAddImage] = useState<boolean>(false);
  const [addUploadError, setAddUploadError] = useState<string | null>(null);
  const [newAddImageUrl, setNewAddImageUrl] = useState('');

  // Staff creation form states
  const [newStaffNameAr, setNewStaffNameAr] = useState('');
  const [newStaffNameEn, setNewStaffNameEn] = useState('');
  const [newStaffUser, setNewStaffUser] = useState('');
  const [newStaffPass, setNewStaffPass] = useState('');
  const [newStaffAllowedTabs, setNewStaffAllowedTabs] = useState<string[]>(['stats', 'products', 'orders', 'sales_report', 'reviews']);
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');

  // Logo upload/drag/drop handling states
  const [logoInputMethod, setLogoInputMethod] = useState<'upload' | 'url'>(
    settings.logoUrl && settings.logoUrl.startsWith('data:') ? 'upload' : 'url'
  );
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [isLogoDragOver, setIsLogoDragOver] = useState<boolean>(false);

  // Order viewing modal/drawer
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showPrinterPairingGuide, setShowPrinterPairingGuide] = useState<boolean>(false);
  const [miniTicketOrder, setMiniTicketOrder] = useState<Order | null>(null);

  // Delete Custom Modal States
  const [deleteConfirmType, setDeleteConfirmType] = useState<'product' | 'order' | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Search and filter for admin sections
  const [searchTerm, setSearchTerm] = useState('');

  // Initialize and check local storage password
  useEffect(() => {
    const savedPassword = localStorage.getItem('admin_password');
    if (!savedPassword) {
      localStorage.setItem('admin_password', 'admin'); // Default password
    }
  }, []);

  // Check notification permission on mount
  useEffect(() => {
    const updatePermissionStatus = async () => {
      const status = await checkNotificationPermission();
      setNotificationStatus(status);
    };
    updatePermissionStatus();
  }, []);

  // Synchronize input fields whenever storeSettings prop changes in real-time from Firebase
  useEffect(() => {
    if (settings) {
      setStoreNameAr(settings.storeNameAr || '');
      setStoreNameEn(settings.storeNameEn || '');
      setOwnerNameAr(settings.ownerNameAr || '');
      setOwnerNameEn(settings.ownerNameEn || '');
      setOwnerPhone(settings.ownerPhone || '');
      setOwnerEmail(settings.ownerEmail || '');
      setLogoUrl(settings.logoUrl || '');
      setCurrencyAr(settings.currencyAr || 'ر.س');
      setCurrencyEn(settings.currencyEn || 'SAR');
      setPromoMsgAr(settings.promoMsgAr || '');
      setPromoMsgEn(settings.promoMsgEn || '');
      setBioAr(settings.bioAr || '');
      setBioEn(settings.bioEn || '');
      if (settings.adminPasscode) {
        localStorage.setItem('admin_password', settings.adminPasscode);
      }
    }
  }, [settings]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = settings.adminPasscode || localStorage.getItem('admin_password') || 'admin';
    
    // 1. Check Super Admin passcode
    if (passwordInput === storedPassword) {
      setIsAuthenticated(true);
      setAdminRole('super');
      setLoggedStaffMember(null);
      setLoginError('');
      setPasswordInput('');
      return;
    }

    // 2. Check Staff passcodes
    const matched = staff.find(s => s.passcode === passwordInput);
    if (matched) {
      setIsAuthenticated(true);
      setAdminRole('staff');
      setLoggedStaffMember(matched);
      setLoginError('');
      setPasswordInput('');
      return;
    }

    setLoginError(lang === 'ar' ? 'رمز المرور غير صحيح!' : 'Incorrect passcode!');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = settings.adminPasscode || localStorage.getItem('admin_password') || 'admin';
    
    if (currentPassword !== storedPassword) {
      setPasswordMessage({
        text: dict.wrongPassword,
        isError: true
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        text: dict.passwordMismatch,
        isError: true
      });
      return;
    }

    if (newPassword.trim() === '') {
      setPasswordMessage({
        text: lang === 'ar' ? 'كلمة المرور لا يمكن أن تكون فارغة!' : 'Password cannot be empty!',
        isError: true
      });
      return;
    }

    localStorage.setItem('admin_password', newPassword);
    
    // Sync to Firestore settings so that all devices get the new admin passcode instantly
    if (settings) {
      try {
        onUpdateSettings({
          ...settings,
          adminPasscode: newPassword
        });
      } catch (err) {
        console.error("Firestore sync failed for adminPassword update:", err);
      }
    }

    setPasswordMessage({
      text: dict.passwordChangedSuccess,
      isError: false
    });
    
    // Reset states
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleRegisterStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    setStaffSuccess('');

    if (!newStaffNameAr.trim() || !newStaffNameEn.trim() || !newStaffUser.trim() || !newStaffPass.trim()) {
      setStaffError(lang === 'ar' ? 'الرجاء ملء جميع الحقول المطلوبة!' : 'Please fill in all required fields!');
      return;
    }

    // Check if passcode is unique and doesn't conflict with main passcode
    const mainPassword = settings.adminPasscode || localStorage.getItem('admin_password') || 'admin';
    if (newStaffPass === mainPassword) {
      setStaffError(lang === 'ar' ? 'رمز مرور الموظف لا يمكن أن يتطابق مع الرمز الرئيسي للمدير!' : 'Staff passcode cannot match the Super Admin master passcode!');
      return;
    }

    if (staff.some(s => s.passcode === newStaffPass)) {
      setStaffError(lang === 'ar' ? 'رمز المرور هذا مستخدم بالفعل من قِبل موظف آخر!' : 'This passcode is already assigned to another staff member!');
      return;
    }

    if (staff.some(s => s.username.toLowerCase() === newStaffUser.trim().toLowerCase())) {
      setStaffError(lang === 'ar' ? 'اسم المستخدم هذا محجوز بالفعل لموظف آخر!' : 'This username is already taken!');
      return;
    }

    if (newStaffPass.trim().length < 4) {
      setStaffError(lang === 'ar' ? 'يجب أن يتكون رمز المرور من 4 خانات على الأقل!' : 'Passcode must be at least 4 characters long!');
      return;
    }

    const newStaff: StaffMember = {
      id: 'staff_' + Date.now(),
      nameAr: newStaffNameAr.trim(),
      nameEn: newStaffNameEn.trim(),
      username: newStaffUser.trim(),
      passcode: newStaffPass.trim(),
      createdAt: new Date().toISOString(),
      allowedTabs: newStaffAllowedTabs
    };

    setIsAdminActionLoading(true);
    try {
      if (onAddStaff) {
        await onAddStaff(newStaff);
        setStaffSuccess(lang === 'ar' ? 'تم إدراج الموظف بنجاح!' : 'Administrative staff member added successfully!');
        // Clear fields
        setNewStaffNameAr('');
        setNewStaffNameEn('');
        setNewStaffUser('');
        setNewStaffPass('');
        setNewStaffAllowedTabs(['stats', 'products', 'orders', 'sales_report', 'reviews']);
      } else {
        throw new Error("onAddStaff prop is not defined");
      }
    } catch (err: any) {
      console.error("Failed to add staff:", err);
      let errorMsg = lang === 'ar' ? 'حدث خطأ أثناء الاتصال بقاعدة البيانات!' : 'An error occurred while writing to the database.';
      if (err && err.message) {
        if (err.message.includes('⚠️')) {
          errorMsg = err.message;
        } else if (err.message.startsWith('{')) {
          try {
            const parsed = JSON.parse(err.message);
            if (parsed.error && (parsed.error.includes('permission-denied') || parsed.error.includes('Permission denied'))) {
              errorMsg = lang === 'ar' 
                ? '⚠️ لا تمتلك الصلاحيات الكافية للتعديل على قاعدة البيانات (Firebase Permission Denied). يرجى التأكد من تسجيل الدخول بحساب Google المسؤول: salahbousbia82@gmail.com'
                : '⚠️ Permission Denied: You do not have write permissions to the database. Please ensure you are logged in with the Google Admin account: salahbousbia82@gmail.com';
            } else {
              errorMsg = `${lang === 'ar' ? 'خطأ في قاعدة البيانات:' : 'Database error:'} ${parsed.error || err.message}`;
            }
          } catch {
            errorMsg = err.message;
          }
        } else {
          errorMsg = err.message;
        }
      }
      setStaffError(errorMsg);
    } finally {
      setIsAdminActionLoading(false);
    }
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdminActionLoading(true);
    setAdminActionError('');
    try {
      await onUpdateSettings({
        storeNameAr: storeNameAr.trim(),
        storeNameEn: storeNameEn.trim(),
        ownerNameAr: ownerNameAr.trim(),
        ownerNameEn: ownerNameEn.trim(),
        ownerPhone: ownerPhone.trim(),
        ownerEmail: ownerEmail.trim(),
        logoUrl: logoUrl.trim(),
        currencyAr: currencyAr.trim(),
        currencyEn: currencyEn.trim(),
        promoMsgAr: promoMsgAr.trim(),
        promoMsgEn: promoMsgEn.trim(),
        bioAr: bioAr.trim(),
        bioEn: bioEn.trim()
      });
      setSettingsSaved(true);
      setTimeout(() => {
        setSettingsSaved(false);
      }, 4000);
    } catch (err) {
      console.error(err);
      setAdminActionError(
        lang === 'ar'
          ? '⚠️ فشل حفظ التعديلات: لا تمتلك الصلاحية للتعديل على قاعدة البيانات (Firebase Permission Denied). يرجى التأكد من تسجيل الدخول بحساب Google المسؤول: salahbousbia82@gmail.com'
          : '⚠️ Save failed: You do not have write permissions to the database (Firebase Permission Denied). Please ensure you are logged in with the Google Admin account: salahbousbia82@gmail.com'
      );
    } finally {
      setIsAdminActionLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationStatus('granted');
    } else {
      setNotificationStatus('denied');
    }
  };

  const handleSendTestNotification = async () => {
    await sendTestNotification();
  };

  const openAddProductModal = () => {
    setAdminActionError('');
    setIsAdminActionLoading(false);
    setEditingProduct(null);
    setTitleAr('');
    setTitleEn('');
    setDescriptionAr('');
    setDescriptionEn('');
    setRecipeAr('');
    setRecipeEn('');
    setIngredientsAr('');
    setIngredientsEn('');
    setPreparationTime('45 دقيقة');
    setDifficulty('medium');
    setShowRecipeToCustomers(true);
    setPrice(0);
    setDiscountPrice(0);
    setCostPrice(0);
    setStock(0);
    setCategory('sweets');
    setIsWeighted(true);
    setBarcode('');
    setImage('https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&q=80&w=600');
    setImageInputMethod('upload');
    setUploadError(null);
    setAdditionalImages([]);
    setNewAddImageUrl('');
    setAddUploadError(null);
    setShowProductModal(true);
  };

  const openEditProductModal = (product: Product) => {
    setAdminActionError('');
    setIsAdminActionLoading(false);
    setEditingProduct(product);
    setTitleAr(product.titleAr);
    setTitleEn(product.titleEn);
    setDescriptionAr(product.descriptionAr);
    setDescriptionEn(product.descriptionEn);
    setRecipeAr(product.recipeAr || '');
    setRecipeEn(product.recipeEn || '');
    setIngredientsAr(product.ingredientsAr || '');
    setIngredientsEn(product.ingredientsEn || '');
    setPreparationTime(product.preparationTime || '');
    setDifficulty(product.difficulty || 'medium');
    setShowRecipeToCustomers(product.showRecipeToCustomers !== false);
    setPrice(product.price);
    setDiscountPrice(product.discountPrice || 0);
    setCostPrice(product.costPrice || 0);
    setStock(product.stock);
    setCategory(product.category);
    setIsWeighted(!!product.isWeighted);
    setBarcode(product.barcode || '');
    setImage(product.image);
    // Intelligent auto-detection of the entry type
    const isBase64 = product.image && product.image.startsWith('data:');
    setImageInputMethod(isBase64 ? 'upload' : 'url');
    setUploadError(null);
    setAdditionalImages(product.images || []);
    setNewAddImageUrl('');
    setAddUploadError(null);
    setShowProductModal(true);
  };

  // Image upload handlers with high-fidelity local Canvas compression
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError(lang === 'ar' ? '⚠️ الرجاء اختيار ملف صورة صالح!' : '⚠️ Please select a valid image file!');
      return;
    }

    setIsUploadingImage(true);
    setUploadError(null);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const imgElement = new Image();
      imgElement.src = event.target?.result as string;
      imgElement.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 640;
        const MAX_HEIGHT = 640;
        let width = imgElement.width;
        let height = imgElement.height;

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
          // Draw image on canvas to compress and resize
          ctx.drawImage(imgElement, 0, 0, width, height);
          
          // Export back as compressed JPEG at 0.75 quality (~35-65KB size footprint)
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
          setImage(compressedBase64);
        }
        setIsUploadingImage(false);
      };
      imgElement.onerror = () => {
        setUploadError(lang === 'ar' ? '⚠️ فشل تحميل وصياغة ملف الصورة.' : '⚠️ Failed to parse image file.');
        setIsUploadingImage(false);
      };
    };
    reader.onerror = () => {
      setUploadError(lang === 'ar' ? '⚠️ فشل قراءة الملف من جهازك.' : '⚠️ Failed to read file from storage.');
      setIsUploadingImage(false);
    };
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleImageDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleImageDragLeave = () => {
    setIsDragOver(false);
  };

  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Multiple additional images handlers
  const processAdditionalImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAddUploadError(lang === 'ar' ? '⚠️ الرجاء اختيار ملف صورة صالح!' : '⚠️ Please select a valid image file!');
      return;
    }

    setIsUploadingAddImage(true);
    setAddUploadError(null);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const imgElement = new Image();
      imgElement.src = event.target?.result as string;
      imgElement.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 640;
        const MAX_HEIGHT = 640;
        let width = imgElement.width;
        let height = imgElement.height;

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
          ctx.drawImage(imgElement, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
          setAdditionalImages((prev) => [...prev, compressedBase64]);
        }
        setIsUploadingAddImage(false);
      };
      imgElement.onerror = () => {
        setAddUploadError(lang === 'ar' ? '⚠️ فشل تحميل وصياغة ملف الصورة.' : '⚠️ Failed to parse image file.');
        setIsUploadingAddImage(false);
      };
    };
    reader.onerror = () => {
      setAddUploadError(lang === 'ar' ? '⚠️ فشل قراءة الملف من جهازك.' : '⚠️ Failed to read file from storage.');
      setIsUploadingAddImage(false);
    };
  };

  const handleAdditionalImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAdditionalImageFile(file);
    }
  };

  const handleAddImageUrl = () => {
    if (!newAddImageUrl.trim()) return;
    setAdditionalImages((prev) => [...prev, newAddImageUrl.trim()]);
    setNewAddImageUrl('');
  };

  const handleRemoveAdditionalImage = (index: number) => {
    setAdditionalImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Logo upload handlers with high-fidelity local Canvas compression
  const processLogoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setLogoUploadError(lang === 'ar' ? '⚠️ الرجاء اختيار ملف صورة صالح!' : '⚠️ Please select a valid image file!');
      return;
    }

    setIsUploadingLogo(true);
    setLogoUploadError(null);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const imgElement = new Image();
      imgElement.src = event.target?.result as string;
      imgElement.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = imgElement.width;
        let height = imgElement.height;

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
          ctx.drawImage(imgElement, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
          setLogoUrl(compressedBase64);
        }
        setIsUploadingLogo(false);
      };
      imgElement.onerror = () => {
        setLogoUploadError(lang === 'ar' ? '⚠️ فشل تحميل وصياغة ملف الصورة.' : '⚠️ Failed to parse image file.');
        setIsUploadingLogo(false);
      };
    };
    reader.onerror = () => {
      setLogoUploadError(lang === 'ar' ? '⚠️ فشل قراءة الملف من جهازك.' : '⚠️ Failed to read file from storage.');
      setIsUploadingLogo(false);
    };
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processLogoFile(file);
    }
  };

  const handleLogoDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsLogoDragOver(true);
  };

  const handleLogoDragLeave = () => {
    setIsLogoDragOver(false);
  };

  const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsLogoDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processLogoFile(file);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdminActionLoading(true);
    setAdminActionError('');

    const categoryArMap: Record<string, string> = {
      electronics: "إلكترونيات",
      fashion: "أزياء وملابس",
      home: "المنزل والمطبخ",
      books: "كتب وثقافة",
      sweets: "حلويات",
      accessories: "اكسيسوارات"
    };

    const isWeightedProduct = isWeighted;

    const prodData = {
      titleAr: titleAr || "منتج غير مسمى",
      titleEn: titleEn || "Unnamed Product",
      descriptionAr: descriptionAr || "",
      descriptionEn: descriptionEn || "",
      recipeAr: recipeAr || "",
      recipeEn: recipeEn || "",
      ingredientsAr: ingredientsAr || "",
      ingredientsEn: ingredientsEn || "",
      preparationTime: preparationTime || "",
      difficulty: difficulty || "medium",
      showRecipeToCustomers,
      price: Number(price) || 0,
      discountPrice: discountPrice > 0 ? Number(discountPrice) : 0,
      stock: Number(stock) || 0,
      category,
      categoryAr: categoryArMap[category] || "عام",
      image: image || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600",
      images: additionalImages,
      barcode: barcode.trim(),
      costPrice: Number(costPrice) || 0,
      isWeighted: isWeightedProduct,
      unitType: isWeightedProduct ? ('kg' as const) : ('unit' as const)
    };

    try {
      if (editingProduct) {
        await onEditProduct(editingProduct.id, prodData);
      } else {
        await onAddProduct(prodData);
      }
      setShowProductModal(false);
    } catch (err) {
      console.error(err);
      setAdminActionError(
        lang === 'ar'
          ? '⚠️ فشل تحديث أو إضافة هذا المنتج في قاعدة بيانات Firebase. يرجى التأكد من أنك قمت بتسجيل الدخول بحساب Google المسؤول.'
          : '⚠️ Failed to save this product in Firebase. Please ensure you are authenticated using the Google Admin account.'
      );
    } finally {
      setIsAdminActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId || !deleteConfirmType) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (deleteConfirmType === 'product') {
        await onDeleteProduct(deleteConfirmId);
      } else {
        await onDeleteOrder(deleteConfirmId);
        // If the deleted order is currently the selected one, clear it
        if (selectedOrder && selectedOrder.id === deleteConfirmId) {
          setSelectedOrder(null);
        }
      }
      // Successful deletion sequence
      setDeleteConfirmType(null);
      setDeleteConfirmId(null);
      setDeleteConfirmName('');
    } catch (err: any) {
      console.error(err);
      setDeleteError(
        lang === 'ar'
          ? '⚠️ فشل الحذف: لا تملك صلاحية للتعديل على قاعدة البيانات (Google Firebase Access Denied).'
          : '⚠️ Deletion failed: You do not have permission to modify this resource (Google Firebase Access Denied).'
      );
    } finally {
      setIsDeleting(false);
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

  // Derived customer reviews stats
  const allReviewsWithProduct = React.useMemo(() => {
    const list: { product: Product; review: ProductReview }[] = [];
    products.forEach((p) => {
      if (p.reviews && Array.isArray(p.reviews)) {
        p.reviews.forEach((r) => {
          list.push({ product: p, review: r });
        });
      }
    });
    // Sort by date (descending)
    return list.sort((a, b) => {
      const db = b.review.date ? new Date(b.review.date).getTime() : 0;
      const da = a.review.date ? new Date(a.review.date).getTime() : 0;
      return db - da;
    });
  }, [products]);

  const totalReviewsCount = allReviewsWithProduct.length;

  // Stats analysis
  const totalSalesVal = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, current) => sum + current.total, 0);

  const activeOrdersVal = orders
    .filter(o => o.status === 'pending' || o.status === 'shipped').length;

  const googleLogged = currentUser != null;
  const isAdmin = currentUser?.email === 'salahbousbia82@gmail.com';
  const isSuper = isAdmin || (isAuthenticated && adminRole === 'super');
  const isStaff = isAuthenticated && adminRole === 'staff';
  const isAuthorized = isSuper || isStaff;

  // Gating access: redirect Staff members out of sections they do not have permissions for
  useEffect(() => {
    if (isAuthorized) {
      if (isSuper) return;
      const staffAllowed = loggedStaffMember?.allowedTabs || ['stats', 'products', 'orders', 'sales_report', 'reviews'];
      if (activeTab === 'settings' || activeTab === 'staff' || !staffAllowed.includes(activeTab)) {
        if (staffAllowed.length > 0) {
          setActiveTab(staffAllowed[0] as any);
        }
      }
    }
  }, [isAuthorized, isSuper, activeTab, loggedStaffMember]);

  if (!isAuthorized) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center p-4 ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-100 shadow-xl relative overflow-hidden animate-fade-in">
          <div className="absolute top-0 right-0 left-0 h-2 bg-emerald-500"></div>
          
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-1.5 transition-all outline-none"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-sans">
              {dict.adminLoginTitle}
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              {isRtl ? 'هذه المنطقة مخصصة لإدارة ومزامنة المتجر مع Firebase' : 'Protected area for store management and Firebase synchronization'}
            </p>
          </div>

          {/* Google Sign-in Option */}
          <div className="mb-6">
            <button
              onClick={onLoginGoogle}
              type="button"
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-center font-bold tracking-wide transition-all shadow-md focus:outline-none hover:shadow-lg cursor-pointer"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V13.4h6.86c-.277 1.56-1.602 4.585-6.86 4.585-4.54 0-8.24-3.765-8.24-8.4 0-4.635 3.7-8.4 8.24-8.4 2.58 0 4.307 1.095 5.298 2.045l2.465-2.37C18.435 1.21 15.62 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.4-.195-1.925H12.24z"/>
              </svg>
              <span>{isRtl ? "الدخول السريع عبر Google" : "Quick Login with Google"}</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2 leading-relaxed">
              {isRtl ? "💡 لتعديل وإدارة قواعد بيانات فايرباز حقيقياً، يجب تسجيل دخول Admin ببريد salahbousbia82@gmail.com" : "💡 To modify dynamic live products/settings on Firebase, you must authenticate as salahbousbia82@gmail.com"}
            </p>
          </div>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-slate-150"></div>
            <span className="flex-shrink mx-4 text-xs text-slate-400 uppercase font-mono">{isRtl ? 'أو' : 'OR'}</span>
            <div className="flex-grow border-t border-slate-150"></div>
          </div>

          {googleLogged && !isAdmin && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl font-semibold text-center leading-relaxed mb-4">
              {isRtl ? (
                <>
                  ⚠️ الحساب الحالي غير مصرح له كمسؤول للمخزن:<br />
                  <span className="underline font-mono">{currentUser.email}</span><br />
                  الرجاء تسجيل الخروج لتغيير الحساب، أو استخدم الرمز كبديل للقراءة فقط.
                </>
              ) : (
                <>
                  ⚠️ This Google account is unauthorized:<br />
                  <span className="underline font-mono">{currentUser.email}</span><br />
                  Please sign out or use passcode for read-only preview fallback.
                </>
              )}
              <button 
                type="button" 
                onClick={onLogoutGoogle} 
                className="mt-2 block mx-auto underline font-bold px-2 py-1 hover:text-rose-900"
              >
                {isRtl ? "تسجيل الخروج من الحساب الحالي" : "Logout from current account"}
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                {isRtl ? 'الرمز البديل (للمعاينة)' : 'Alternate Passcode (Preview)'}
              </label>
              <input 
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={dict.enterPasswordPlaceholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-center tracking-widest font-mono text-sm"
              />
            </div>

            {loginError && (
              <p className="text-rose-500 text-xs text-center bg-rose-50 rounded-lg p-2 font-medium">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="w-full block py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-center font-bold tracking-wide transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm cursor-pointer"
            >
              {dict.loginButton}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[10px] text-slate-400 font-mono">
              {isRtl ? 'الرمز التجريبي البديل: ' : 'Alternate testing passcode: '}
              <span className="font-bold text-slate-600 underline">admin</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filtered Products for admin display
  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const title = lang === 'ar' ? p.titleAr : p.titleEn;
    const cat = lang === 'ar' ? p.categoryAr : p.category;
    const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(term) : false;
    return title.toLowerCase().includes(term) || cat.toLowerCase().includes(term) || barcodeMatch;
  });

  // Filtered Orders
  const filteredOrders = orders.filter(o => {
    const term = searchTerm.toLowerCase();
    return o.id.toLowerCase().includes(term) || o.customerName.toLowerCase().includes(term) || o.customerPhone.includes(term);
  });

  return (
    <div id="admin-main" className={`min-h-screen bg-slate-50/70 text-slate-850 flex flex-col ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Admin Navbar */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            {settings.logoUrl ? (
              <img 
                src={settings.logoUrl} 
                alt="Logo" 
                className="w-10 h-10 object-cover rounded-xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-lg font-mono">
                M
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {lang === 'ar' ? settings.storeNameAr : settings.storeNameEn}
              </h1>
              <p className="text-xs text-emerald-600 font-semibold">{dict.adminPanel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const isTabAllowed = (tabKey: string) => {
                if (isSuper) return true;
                const staffAllowed = loggedStaffMember?.allowedTabs || ['stats', 'products', 'orders', 'sales_report', 'reviews'];
                return staffAllowed.includes(tabKey);
              };

              return (
                <>
                  {isTabAllowed('stats') && (
                    <button
                       onClick={() => setActiveTab('stats')}
                       className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                         activeTab === 'stats'
                           ? 'bg-emerald-50 text-emerald-700'
                           : 'text-slate-600 hover:bg-slate-100'
                       }`}
                    >
                      {isRtl ? 'الإحصائيات' : 'Stats'}
                    </button>
                  )}
                  {isTabAllowed('products') && (
                    <button
                       onClick={() => setActiveTab('products')}
                       className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                         activeTab === 'products'
                           ? 'bg-emerald-50 text-emerald-700'
                           : 'text-slate-600 hover:bg-slate-100'
                       }`}
                    >
                      {isRtl ? 'المنتجات' : 'Products'}
                    </button>
                  )}
                  {isTabAllowed('orders') && (
                    <button
                       onClick={() => { setActiveTab('orders'); setSearchTerm(''); }}
                       className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all relative ${
                         activeTab === 'orders'
                           ? 'bg-emerald-50 text-emerald-700'
                           : 'text-slate-600 hover:bg-slate-100'
                       }`}
                    >
                      {isRtl ? 'الطلبات' : 'Orders'}
                      {orders.filter(o => o.status === 'pending').length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                          {orders.filter(o => o.status === 'pending').length}
                        </span>
                      )}
                    </button>
                  )}
                  {isTabAllowed('sales_report') && (
                    <button
                       onClick={() => { setActiveTab('sales_report'); setStatsSearchTerm(''); }}
                       className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                         activeTab === 'sales_report'
                           ? 'bg-emerald-50 text-emerald-700 font-bold border-b-2 border-emerald-500'
                           : 'text-slate-600 hover:bg-slate-100'
                       }`}
                    >
                      {isRtl ? '📈 تقارير الأرباح والمبيعات' : '📈 Sales & Profits'}
                    </button>
                  )}
                  {isTabAllowed('reviews') && (
                    <button
                       onClick={() => { setActiveTab('reviews'); setReviewSearchTerm(''); setReviewRatingFilter('all'); }}
                       className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all relative ${
                         activeTab === 'reviews'
                           ? 'bg-emerald-50 text-emerald-700'
                           : 'text-slate-600 hover:bg-slate-100'
                       }`}
                    >
                      {isRtl ? 'التقييمات والآراء' : 'Reviews & Ratings'}
                      {totalReviewsCount > 0 && (
                        <span className="ms-1 px-1.5 py-0.5 bg-slate-200 text-slate-705 text-[10px] rounded-md font-bold text-slate-600">
                          {totalReviewsCount}
                        </span>
                      )}
                    </button>
                  )}
                </>
              );
            })()}
            {isSuper && (
              <button
                 onClick={() => setActiveTab('settings')}
                 className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                   activeTab === 'settings'
                     ? 'bg-emerald-50 text-emerald-700'
                     : 'text-slate-600 hover:bg-slate-100'
                 }`}
              >
                {isRtl ? 'الإعدادات والهوية' : 'Branding & Settings'}
              </button>
            )}

            {isSuper && (
              <button
                 onClick={() => setActiveTab('staff')}
                 className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                   activeTab === 'staff'
                     ? 'bg-emerald-50 text-emerald-700'
                     : 'text-slate-600 hover:bg-slate-100'
                 }`}
              >
                {isRtl ? 'إدارة الموظفين' : 'Staff Management'}
              </button>
            )}

            {isSuper && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200/50 text-xs font-bold font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>{isRtl ? 'المدير المسؤول 👑' : 'Super Admin 👑'}</span>
              </div>
            )}

            {isStaff && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-800 rounded-xl border border-blue-200/35 text-xs font-bold font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                <span>{isRtl ? `موظف: ${loggedStaffMember?.nameAr}` : `Staff: ${loggedStaffMember?.nameEn}`}</span>
              </div>
            )}

            {currentUser && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 rounded-xl border border-slate-200">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt={currentUser.displayName || ''} className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-5 h-5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full flex items-center justify-center font-bold">
                    {currentUser.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] font-mono font-semibold text-slate-600 hidden lg:inline">{currentUser.email}</span>
              </div>
            )}

            <div className="h-6 w-px bg-slate-200 mx-1 sm:mx-2"></div>

            <button 
              onClick={() => {
                setIsAuthenticated(false);
                onLogoutGoogle();
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-xl text-sm transition-all flex items-center gap-1.5 font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span>{dict.adminLogout}</span>
            </button>

            <button 
              onClick={onClose}
              className="px-3 py-2 bg-slate-950 text-white hover:bg-slate-800 rounded-xl text-sm font-medium transition-all"
            >
              {isRtl ? 'الرجوع للمتجر ⬅️' : '⬅️ Back to Store'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {!isSuper && !isStaff && (
          <div className="mb-6 p-4 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200 text-xs sm:text-sm font-semibold flex items-center gap-2 leading-relaxed animate-fade-in shadow-xs">
            <span>⚠️</span>
            <p>
              {isRtl ? (
                <>
                  أنت تتصفح الإدارة عبر <b>الرمز البديل للمعاينة</b>. لحفظ التعديلات، المنتجات، وإعدادات الهوية بشكل حقيقي ومستمر في قاعدة بيانات <b>Firebase Firestore</b>، يجب تسجيل الدخول بحساب Google المسؤول: <span className="underline font-mono">salahbousbia82@gmail.com</span>
                </>
              ) : (
                <>
                  You are viewing the dashboard using the <b>alternate preview passcode</b>. To write active edits, product catalog changes, or store branding permanently to <b>Firebase Firestore</b>, you must authenticate as the Google Admin: <span className="underline font-mono ml-1">salahbousbia82@gmail.com</span>
                </>
              )}
            </p>
          </div>
        )}
        
        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <div className="space-y-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-850 tracking-tight">{dict.dashboardStats}</h2>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{dict.totalSales}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
                    {totalSalesVal} <span className="text-sm font-sans text-emerald-600 font-medium">{dict.currency}</span>
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{dict.ordersCount}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
                    {orders.length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{dict.productsCount}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
                    {products.length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  <Boxes className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{dict.activeOrders}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
                    {activeOrdersVal}
                  </p>
                </div>
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

            </div>

            {/* Custom Interactive Sales Visualizer (Renders Sales Chart in pure HTML with beautiful visual density) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span>{isRtl ? 'حركة المبيعات والطلبات حسب الحالة' : 'Sales performance & status distribution'}</span>
              </h3>

              {orders.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>{isRtl ? 'لا يوجد بيانات كافية لعرض الرسم البياني.' : 'No data available to display chart analysis.'}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Visual Status bars distribution */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Status counts and visual bars */}
                    <div className="space-y-4">
                      <p className="text-sm font-semibold text-slate-500">
                        {isRtl ? 'توزيع الطلبات وفق الحالة' : 'Orders status distribution'}
                      </p>
                      
                      {['pending', 'shipped', 'delivered', 'cancelled'].map((status) => {
                        const count = orders.filter(o => o.status === status).length;
                        const percentage = orders.length > 0 ? (count / orders.length) * 100 : 0;
                        const colorClass = 
                          status === 'pending' ? 'bg-amber-500' :
                          status === 'shipped' ? 'bg-blue-500' :
                          status === 'delivered' ? 'bg-emerald-500' : 'bg-slate-300';
                        
                        return (
                          <div key={status} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-700 capitalize">
                                {dict.statusOptions[status as keyof typeof dict.statusOptions]}
                              </span>
                              <span className="text-slate-500 font-mono">
                                {count} ({percentage.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                              <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Sales Overview and Last Orders mini-log */}
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-800 mb-3 text-slate-600">
                        {isRtl ? 'آخر العمليات الواردة للمتجر' : 'Latest transactional store events'}
                      </h4>
                      <div className="space-y-3">
                        {orders.slice(0, 4).map((order) => (
                          <div key={order.id} className="bg-white p-3 rounded-lg border border-slate-200/60 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-800 font-mono">#{order.id.slice(0, 8)}</p>
                              <p className="text-slate-500 mt-1">{order.customerName}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-slate-800 font-mono">{order.total} {dict.currency}</p>
                              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1 ${
                                order.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' :
                                order.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                order.status === 'shipped' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {dict.statusOptions[order.status]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRODUCTS MANAGEMENT TAB */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {isRtl ? 'إدارة المنتجات في المتجر' : 'Product Inventory Management'}
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  {isRtl ? 'إجمالي عدد المنتجات المعروضة: ' : 'Total active products listed: '}
                  <span className="font-bold text-emerald-600">{products.length}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar with Barcode Scan capability */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <input 
                      type="text" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={dict.searchBarcodePlaceholder}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 pl-9 pr-10 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    
                    {/* Tiny clear search button if search matches barcode or filter active */}
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm('')} 
                        className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* High Crafted Scan trigger button */}
                  <button
                    onClick={() => setIsAdminScannerOpen(true)}
                    type="button"
                    title={dict.scanBarcode}
                    className="p-2.5 bg-emerald-50 hover:bg-emerald-105 border border-emerald-100 text-emerald-700 hover:text-emerald-800 rounded-xl transition-all shadow-xs flex items-center justify-center font-bold"
                  >
                    📷
                  </button>
                </div>

                {products.length === 0 && onSeedDefaultProducts && (
                  <button
                    onClick={async () => {
                      setIsAdminActionLoading(true);
                      await onSeedDefaultProducts();
                      setIsAdminActionLoading(false);
                    }}
                    disabled={isAdminActionLoading}
                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 rounded-xl text-sm font-bold flex items-center gap-2 transition-all outline-none disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{isRtl ? 'تحميل عينات المنتجات' : 'Load Demo Products'}</span>
                  </button>
                )}

                <button
                  onClick={openAddProductModal}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md outline-none"
                >
                  <Plus className="w-4 h-4" />
                  <span>{dict.addProduct}</span>
                </button>
              </div>
            </div>

            {/* Product table for easy administration */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" dir={isRtl ? 'rtl' : 'ltr'}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4">{isRtl ? 'المنتج' : 'Product'}</th>
                      <th className="px-6 py-4">{isRtl ? 'الفئة' : 'Category'}</th>
                      <th className="px-6 py-4">{isRtl ? 'سعر البيع' : 'Selling Price'}</th>
                      <th className="px-6 py-4">{isRtl ? 'التكلفة (سعر الشراء)' : 'Cost Price'}</th>
                      <th className="px-6 py-4 text-emerald-600 font-bold">{isRtl ? 'الربح المتوقع لكل حبة' : 'Expected Profit'}</th>
                      <th className="px-6 py-4">{isRtl ? 'المخزون المتاح' : 'Stock Status'}</th>
                      <th className="px-6 py-4 text-center">{isRtl ? 'الإجراءات والتحكم' : 'Management'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {filteredProducts.map((p) => {
                      const displayTitle = lang === 'ar' ? p.titleAr : p.titleEn;
                      const displayCat = lang === 'ar' ? p.categoryAr : p.category;
                      
                      const sellPrice = p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price;
                      const cost = p.costPrice || 0;
                      const profitVal = sellPrice - cost;
                      const marginPercent = sellPrice > 0 ? Math.round((profitVal / sellPrice) * 100) : 0;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-all">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img 
                                src={p.image} 
                                alt={displayTitle} 
                                className="w-12 h-12 rounded-lg object-contain bg-slate-50 border border-slate-100 p-[3%] flex-shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <h4 className="font-bold text-slate-900">{displayTitle}</h4>
                                <p className="text-xs text-slate-400 font-mono max-w-sm truncate mt-0.5">
                                  {lang === 'ar' ? p.descriptionAr : p.descriptionEn}
                                </p>
                                {p.barcode && (
                                  <div className="flex items-center gap-1.5 mt-1.5 ">
                                    <span className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-650 font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 cursor-help group relative border border-slate-150">
                                      🏷️ {p.barcode}
                                      {/* Hover tooltip with active SVG barcode preview! */}
                                      <div className={`absolute bottom-full mb-2 hidden group-hover:block z-50 bg-white p-2.5 rounded-xl border border-slate-200 shadow-md ${isRtl ? 'right-0' : 'left-0'}`}>
                                        <BarcodeSVG value={p.barcode} width={1.2} height={35} showText={false} />
                                        <p className="text-[9px] text-slate-450 font-mono tracking-widest mt-1 text-center font-bold">{p.barcode}</p>
                                      </div>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-semibold">
                              {displayCat}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price ? (
                              <div className="space-y-1 font-mono">
                                <span className="text-[10px] text-slate-400 line-through block leading-none">
                                  {p.price} {dict.currency}
                                </span>
                                <span className="text-xs font-black text-rose-650 block leading-none">
                                  {p.discountPrice} {dict.currency}
                                </span>
                                <span className="inline-block bg-rose-50 border border-rose-100 text-[9px] text-rose-600 font-extrabold px-1 rounded">
                                  -{Math.round(((p.price - p.discountPrice) / p.price) * 100)}%
                                </span>
                              </div>
                            ) : (
                              <span className="font-bold text-slate-900 font-mono">
                                {p.price} {dict.currency}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-650 font-semibold">
                            {p.costPrice ? (
                              <span>{p.costPrice} {dict.currency}</span>
                            ) : (
                              <span className="text-amber-600 font-normal">{isRtl ? '0 (غير محدد)' : '0 (Not set)'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-0.5 font-mono">
                              <span className={`text-xs font-bold block ${profitVal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {profitVal >= 0 ? '+' : ''}{profitVal.toFixed(2)} {dict.currency}
                              </span>
                              {sellPrice > 0 && (
                                <span className="text-[10px] text-slate-400 block font-normal leading-none mt-0.5">
                                  {isRtl ? 'هامش:' : 'Margin:'} {marginPercent}%
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                p.stock === 0 ? 'bg-red-500' :
                                p.stock < 5 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}></span>
                              <span className="font-mono text-xs font-bold text-slate-650">
                                {p.stock} {isRtl ? 'حبة' : 'items'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditProductModal(p)}
                                className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded-lg transition-all"
                                title={dict.editProduct}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteConfirmType('product');
                                  setDeleteConfirmId(p.id);
                                  setDeleteConfirmName(lang === 'ar' ? p.titleAr : p.titleEn);
                                  setDeleteError(null);
                                }}
                                className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg transition-all"
                                title={dict.deleteProduct}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          {isRtl ? 'لم نعثر على أي منتجات مطابقة للبحث.' : 'No matching products found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ORDERS MANAGEMENT TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{dict.ordersList}</h2>
                <p className="text-slate-500 text-sm mt-1">
                  {isRtl ? 'إجمالي الطلبات الواردة: ' : 'Total raw requests history: '} 
                  <span className="font-bold text-emerald-600">{orders.length}</span>
                </p>
              </div>

              {/* Search Bar for Orders */}
              <div className="relative w-full sm:w-80">
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={isRtl ? 'ابحث باسم الهاتف، العميل، رقم الطلب...' : 'Search by name, phone, order number...'}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 pl-9 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            {/* Incoming orders panel */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left" dir={isRtl ? 'rtl' : 'ltr'}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4">{isRtl ? 'رقم الطلب' : 'Order ID'}</th>
                      <th className="px-6 py-4">{dict.customer}</th>
                      <th className="px-6 py-4">{dict.date}</th>
                      <th className="px-6 py-4">{dict.total}</th>
                      <th className="px-6 py-4">{dict.statusLabel}</th>
                      <th className="px-6 py-4 text-center">{isRtl ? 'إدارة وتحميل المعاملة' : 'Operations'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-750">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                          #{order.id.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-bold text-slate-900">{order.customerName}</p>
                            <p className="text-xs text-slate-500 font-mono">{order.customerPhone}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">
                          {order.date}
                        </td>
                        <td className="px-6 py-4 font-bold font-mono text-slate-950">
                          {order.total} {dict.currency}
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={order.status}
                            onChange={async (e) => {
                              try {
                                await onUpdateOrderStatus(order.id, e.target.value as Order['status']);
                              } catch (err) {
                                console.error(err);
                                alert(lang === 'ar'
                                  ? '⚠️ فشل تحديث حالة الطلب: لا تملك صلاحية للتعديل على قاعدة البيانات (Firebase Permission Denied).'
                                  : '⚠️ Fails to update status: You do not possess write permissions for the database (Firebase Permission Denied).'
                                );
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans border-0 focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
                              order.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                              order.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                              order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-rose-100 text-rose-800'
                            }`}
                          >
                            <option value="pending">{dict.statusOptions.pending}</option>
                            <option value="shipped">{dict.statusOptions.shipped}</option>
                            <option value="delivered">{dict.statusOptions.delivered}</option>
                            <option value="cancelled">{dict.statusOptions.cancelled}</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                              title={isRtl ? 'عرض تفاصيل المنتجات' : 'View products details'}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{isRtl ? 'عرض المنتجات' : 'View Items'}</span>
                            </button>
                            <button
                              onClick={() => handleDownloadInvoice(order)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all border border-emerald-150 cursor-pointer"
                              title={isRtl ? 'طباعة الفاتورة التفصيلية' : 'Print Detailed Invoice'}
                            >
                              <Printer className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{isRtl ? 'فاتورة' : 'Invoice'}</span>
                            </button>
                            <button
                              onClick={() => handleMiniThermalPrint(order)}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-black flex items-center gap-1 transition-all border border-amber-200 cursor-pointer shadow-2xs"
                              title={isRtl ? 'طباعة تيكيت ميني حرارية مباشرة (58mm Mini Printer)' : 'Mini Thermal Print'}
                            >
                              <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                              <span>{isRtl ? 'تيكيت ميني 📱' : 'Mini Ticket 📱'}</span>
                            </button>
                            <button
                              onClick={() => {
                                setDeleteConfirmType('order');
                                setDeleteConfirmId(order.id);
                                setDeleteConfirmName(order.id);
                                setDeleteError(null);
                              }}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all border border-rose-150"
                              title={isRtl ? 'حذف الطلب' : 'Delete Order'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{isRtl ? 'حذف' : 'Delete'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          {dict.noOrders}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS AND CUSTOMIZATION TAB */}
        {activeTab === 'settings' && (
          <div className="max-w-5xl mx-auto py-4 animate-fade-in space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* BRANDING & IDENTITY SETTINGS */}
              <div className="lg:col-span-7 bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        {isRtl ? 'إدارة هوية المتجر والمالك' : 'Store Identity & Owners Settings'}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRtl ? 'تخصيص شعار واسم المتجر، وبيانات المالك والاتصال بالفاتورة' : 'Customize store logo, name, owner credentials for the site and invoices'}
                      </p>
                    </div>
                  </div>

                  {settingsSaved && (
                    <div className="p-4 rounded-xl text-sm font-semibold mb-6 bg-emerald-50 text-emerald-700 animate-fade-in">
                      {isRtl ? '✨ تم حفظ وتطبيق إعدادات هوية متجرك بنجاح!' : '✨ Store customization settings saved successfully!'}
                    </div>
                  )}

                  {adminActionError && activeTab === 'settings' && (
                    <div className="p-4 rounded-xl text-sm font-semibold mb-6 bg-rose-50 border border-rose-200 text-rose-700 animate-fade-in font-sans">
                      {adminActionError}
                    </div>
                  )}

                  <form onSubmit={handleSaveStoreSettings} className="space-y-4">
                    {/* Store Logo configuration */}
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                        <div>
                          <label className="block text-sm font-bold text-slate-800">
                            {isRtl ? 'شعار المتجر المخصص' : 'Custom Store Logo'}
                          </label>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isRtl ? 'اختر طريقة تحديد الشعار المناسبة لمتجرك' : 'Choose how you would like to set your store logo'}
                          </p>
                        </div>

                        {/* Toggle Switches */}
                        <div className="flex bg-slate-200/60 p-0.5 rounded-lg w-fit">
                          <button
                            type="button"
                            onClick={() => {
                              setLogoInputMethod('upload');
                              setLogoUploadError(null);
                            }}
                            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                              logoInputMethod === 'upload'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-850'
                            }`}
                          >
                            📤 {isRtl ? 'رفع شعار' : 'Upload File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLogoInputMethod('url');
                              setLogoUploadError(null);
                            }}
                            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                              logoInputMethod === 'url'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-850'
                            }`}
                          >
                            🌐 {isRtl ? 'رابط ويب' : 'Web URL'}
                          </button>
                        </div>
                      </div>

                      {logoUploadError && (
                        <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-100 animate-fade-in">
                          {logoUploadError}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-center gap-5">
                        {/* Logo Preview box */}
                        <div className="w-20 h-20 bg-white border border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner flex-shrink-0">
                          {logoUrl ? (
                            <img 
                              src={logoUrl} 
                              alt="Logo preview" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&q=80&w=150';
                              }}
                            />
                          ) : (
                            <ShoppingBag className="w-8 h-8 text-slate-350" />
                          )}
                        </div>

                        {/* Input mechanism representation */}
                        <div className="flex-1 w-full">
                          {logoInputMethod === 'upload' ? (
                            <div
                              onDragOver={handleLogoDragOver}
                              onDragLeave={handleLogoDragLeave}
                              onDrop={handleLogoDrop}
                              onClick={() => document.getElementById('settings-logo-uploaded')?.click()}
                              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[90px] ${
                                isLogoDragOver
                                  ? 'border-emerald-500 bg-emerald-50/40'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="file"
                                id="settings-logo-uploaded"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoFileChange}
                                disabled={isUploadingLogo}
                              />

                              {isUploadingLogo ? (
                                <div className="flex flex-col items-center gap-1">
                                  <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin" />
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    {isRtl ? 'جاري ضغط ومعالجة الشعار...' : 'Processing store logo...'}
                                  </span>
                                </div>
                              ) : logoUrl ? (
                                <div className="text-center">
                                  <span className="text-[11px] text-emerald-600 font-bold block mb-0.5">
                                    {isRtl ? '✨ تم معالجة الشعار وتجهيزه بنجاح' : '✨ Logo processed successfully'}
                                  </span>
                                  <span className="text-[9px] text-slate-400">
                                    {isRtl ? '(اسحب ملفاً جديداً أو انقر هنا للتحديث)' : '(Drag a new file or click here to update)'}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <Upload className="w-4 h-4 text-slate-400" />
                                  <p className="text-[11px] font-bold text-slate-700">
                                    {isRtl ? 'قم بسحب وإفلات صورة الشعار هنا، أو انقر للتصفح' : 'Drag & drop your logo here, or click to browse'}
                                  </p>
                                  <span className="text-[9px] text-slate-400">
                                    {isRtl ? 'JPG أو PNG مضغوط ومحسن' : 'Supports optimized JPG or PNG'}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">
                                {isRtl ? 'رابط الشعار المباشر (URL)' : 'Direct Logo Image URL'}
                              </label>
                              <input
                                type="url"
                                value={logoUrl}
                                onChange={(e) => setLogoUrl(e.target.value)}
                                placeholder="https://example.com/logo.png"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Store Names - Arabic & English */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {isRtl ? 'اسم المتجر (بالعربية)' : 'Store Name (Arabic)'}
                        </label>
                        <input
                          type="text"
                          required
                          value={storeNameAr}
                          onChange={(e) => setStoreNameAr(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {isRtl ? 'اسم المتجر (بالإنجليزية)' : 'Store Name (English)'}
                        </label>
                        <input
                          type="text"
                          required
                          value={storeNameEn}
                          onChange={(e) => setStoreNameEn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white animate-sans"
                        />
                      </div>
                    </div>

                    {/* Store Owners Name - Arabic & English */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {isRtl ? 'اسم صاحب الموقع / المدير (بالعربية)' : 'Owner Name (Arabic)'}
                        </label>
                        <input
                          type="text"
                          required
                          value={ownerNameAr}
                          onChange={(e) => setOwnerNameAr(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {isRtl ? 'اسم صاحب الموقع / المدير (بالإنجليزية)' : 'Owner Name (English)'}
                        </label>
                        <input
                          type="text"
                          required
                          value={ownerNameEn}
                          onChange={(e) => setOwnerNameEn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Owner Phone & Email details for Customer Support */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {isRtl ? 'رقم الهاتف للتواصل' : 'Owner Support Phone'}
                        </label>
                        <input
                          type="text"
                          required
                          value={ownerPhone}
                          onChange={(e) => setOwnerPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {isRtl ? 'البريد الإلكتروني للإدارة' : 'Owner Admin Email'}
                        </label>
                        <input
                          type="email"
                          required
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white font-mono"
                        />
                      </div>
                    </div>

                    {/* Currency Customizer Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {dict.currencyArLabel}
                        </label>
                        <input
                          type="text"
                          required
                          value={currencyAr}
                          onChange={(e) => setCurrencyAr(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {dict.currencyEnLabel}
                        </label>
                        <input
                          type="text"
                          required
                          value={currencyEn}
                          onChange={(e) => setCurrencyEn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-150 border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Announcement Bar Customizer Section */}
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {dict.promoMsgArLabel}
                        </label>
                        <input
                          type="text"
                          required
                          value={promoMsgAr}
                          onChange={(e) => setPromoMsgAr(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {dict.promoMsgEnLabel}
                        </label>
                        <input
                          type="text"
                          required
                          value={promoMsgEn}
                          onChange={(e) => setPromoMsgEn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Website Bio/Overview Customizer Section */}
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {dict.bioArLabel}
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={bioAr}
                          onChange={(e) => setBioAr(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {dict.bioEnLabel}
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={bioEn}
                          onChange={(e) => setBioEn(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white resize-y"
                        />
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        type="submit"
                        disabled={isAdminActionLoading}
                        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-center font-bold tracking-wide transition-all shadow-md focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isAdminActionLoading ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            <span>{isRtl ? 'جاري حفظ التعديلات...' : 'Saving customization...'}</span>
                          </>
                        ) : (
                          <span>{isRtl ? 'حفظ إعدادات الهوية والشعار 💾' : 'Save Identity Settings 💾'}</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* RIGHT COLUMN: SECURITY & NOTIFICATIONS */}
              <div className="lg:col-span-5 space-y-8">
                {/* SECURITY & PASSWORD SETTINGS */}
                <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">{dict.changePasswordTitle}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRtl ? 'تغيير العبارة السرية للدخول الآمن للوحة الإدارة' : 'Change the master administrator gate pass'}
                      </p>
                    </div>
                  </div>

                  {passwordMessage && (
                    <div className={`p-4 rounded-xl text-xs font-semibold mb-6 ${
                      passwordMessage.isError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {passwordMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        {dict.currentPassword}
                      </label>
                      <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                      />
                    </div>

                    <div className="h-px bg-slate-100 my-2"></div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        {dict.newPassword}
                      </label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        {dict.confirmPassword}
                      </label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-850 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-center font-bold tracking-wide transition-all shadow-md focus:outline-none"
                      >
                        {dict.saveChanges}
                      </button>
                    </div>
                  </form>
                </div>

                {/* PHONE NOTIFICATIONS SETTINGS */}
                <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        {isRtl ? 'إشعارات الهاتف الفورية' : 'Instant Phone Notifications'}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRtl ? 'استقبل تنبيهاً فورياً على هاتفك أو متصفحك عند وصول أي طلب جديد' : 'Receive an instant notification on your device when a new order is placed'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">
                        {isRtl ? 'حالة الإشعارات:' : 'Notifications Status:'}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        notificationStatus === 'granted' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : notificationStatus === 'denied' 
                            ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {notificationStatus === 'granted' && (isRtl ? 'مفعّلة ومتصلة ✅' : 'Enabled & Connected ✅')}
                        {notificationStatus === 'denied' && (isRtl ? 'مرفوضة من الهاتف ❌' : 'Blocked by device ❌')}
                        {notificationStatus === 'prompt' && (isRtl ? 'بانتظار الصلاحية 🔔' : 'Awaiting Permission 🔔')}
                        {notificationStatus === 'unsupported' && (isRtl ? 'غير مدعوم على هذا المتصفح ⚠️' : 'Unsupported on this browser ⚠️')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      {isRtl 
                        ? 'تتيح لك هذه الميزة سماع صوت رنين مميز واستقبال إشعار منبثق فوري على الشاشة حتى لو كان التطبيق مغلقاً أو في الخلفية.' 
                        : 'This feature plays an alert sound and pops up an instant notification even if the app is closed or running in the background.'}
                    </p>

                    {notificationStatus !== 'granted' && notificationStatus !== 'unsupported' && (
                      <button
                        type="button"
                        onClick={handleEnableNotifications}
                        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-center font-bold tracking-wide transition-all shadow-md flex items-center justify-center gap-2 text-sm cursor-pointer"
                      >
                        <Smartphone className="w-4 h-4" />
                        {isRtl ? 'السماح باستقبال الإشعارات الآن 📱' : 'Allow Phone Notifications Now 📱'}
                      </button>
                    )}

                    {notificationStatus === 'granted' && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handleSendTestNotification}
                          className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-center font-bold tracking-wide transition-all border border-slate-200 flex items-center justify-center gap-2 text-xs cursor-pointer"
                        >
                          <span>🧪</span>
                          {isRtl ? 'إرسال إشعار تجريبي لاختبار الاتصال' : 'Send Test Notification to Phone'}
                        </button>
                        <p className="text-[10px] text-slate-400 text-center">
                          {isRtl ? 'اضغط لاختبار الرنين وظهور الإشعار فوراً' : 'Tap to test the notification chime and alert immediately'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* REVIEWS MANAGEMENT TAB */}
        {activeTab === 'reviews' && (
          <div className="max-w-6xl mx-auto py-4 animate-fade-in space-y-8">
            {/* Review Metrics Header & Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              
              {/* Card 1: Total reviews */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {isRtl ? 'إجمالي التقييمات' : 'Total Reviews'}
                  </p>
                  <h3 className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">
                    {totalReviewsCount}
                  </h3>
                </div>
              </div>

              {/* Card 2: Average rating */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shrink-0">
                  <Star className="w-6 h-6 fill-amber-400 stroke-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {isRtl ? 'معدل التقييم العام' : 'Average Rating'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 font-sans">
                    <h3 className="text-2xl font-extrabold text-slate-800 font-mono">
                      {totalReviewsCount === 0
                        ? '0.0'
                        : (
                            allReviewsWithProduct.reduce((sum, item) => sum + item.review.rating, 0) /
                            totalReviewsCount
                          ).toFixed(1)}
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">/ 5</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Ratings distribution overview */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
                <div className="space-y-1.5 w-full">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = allReviewsWithProduct.filter(r => r.review.rating === stars).length;
                    const percent = totalReviewsCount === 0 ? 0 : Math.round((count / totalReviewsCount) * 100);
                    return (
                      <div key={stars} className="flex items-center gap-2 text-xs">
                        <span className="w-3 text-right font-bold text-slate-500 font-sans">{stars}</span>
                        <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500 shrink-0" />
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-amber-400 rounded-full" 
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                        <span className="w-12 text-left font-semibold text-slate-400 font-mono text-[10px]">{percent}% ({count})</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Filter controls */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <span className={`absolute inset-y-0 flex items-center pointer-events-none text-slate-400 ${isRtl ? 'right-3' : 'left-3'}`}>
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={reviewSearchTerm}
                    onChange={(e) => setReviewSearchTerm(e.target.value)}
                    placeholder={isRtl ? 'البحث عن تقييم باسم العميل، المنتج أو في محتوى التعليق...' : 'Search reviews by customer, product title, or content...'}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all ${isRtl ? 'pr-9 pl-4' : 'pl-9 pr-4'}`}
                  />
                </div>

                {/* Rating selection buttons */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-xs font-bold text-slate-400 mr-1 ml-1 font-sans">
                    {isRtl ? 'تصفية حسب التميز:' : 'Rating Filter:'}
                  </span>
                  
                  <button
                    onClick={() => setReviewRatingFilter('all')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                      reviewRatingFilter === 'all'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-150'
                    }`}
                  >
                    {isRtl ? 'الكل' : 'All'}
                  </button>

                  {[5, 4, 3, 2, 1].map((stars) => (
                    <button
                      key={stars}
                      onClick={() => setReviewRatingFilter(stars)}
                      className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all text-xs ${
                        reviewRatingFilter === stars
                          ? 'bg-amber-400 text-slate-900 border border-amber-400'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-150'
                      }`}
                    >
                      <span>{stars}</span>
                      <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500" />
                    </button>
                  ))}

                  <button
                    onClick={() => setReviewRatingFilter('critical')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                      reviewRatingFilter === 'critical'
                        ? 'bg-rose-600 text-white shadow-xs border border-rose-600'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100'
                    }`}
                  >
                    {isRtl ? 'مستاء (1-2★)' : 'Critical (1-2★)'}
                  </button>
                </div>
              </div>
            </div>

            {/* List of Reviews */}
            <div className="space-y-4">
              {(() => {
                // Apply search & filters
                const filtered = allReviewsWithProduct.filter((item) => {
                  const r = item.review;
                  const p = item.product;

                  // Rating filter
                  if (reviewRatingFilter === 'critical') {
                    if (r.rating > 2) return false;
                  } else if (reviewRatingFilter !== 'all') {
                    if (r.rating !== reviewRatingFilter) return false;
                  }

                  // Search term filter
                  if (reviewSearchTerm.trim()) {
                    const q = reviewSearchTerm.toLowerCase();
                    const reviewerMatch = r.userName?.toLowerCase().includes(q);
                    const commentMatch = r.comment?.toLowerCase().includes(q);
                    const prodEnMatch = p.titleEn?.toLowerCase().includes(q);
                    const prodArMatch = p.titleAr?.includes(q);
                    return reviewerMatch || commentMatch || prodEnMatch || prodArMatch;
                  }

                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center shadow-xs">
                      <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="w-8 h-8 text-slate-300" />
                      </div>
                      <h4 className="text-base font-bold text-slate-800">
                        {isRtl ? 'لا توجد تقييمات للعملاء' : 'No Reviews Found'}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        {reviewSearchTerm.trim() || reviewRatingFilter !== 'all'
                          ? (isRtl ? 'لم نعثر على أي تقييم في المتجر يطابق فلاتر البحث الحالية.' : 'We could not find any store feedback matching your current search filters.')
                          : (isRtl ? 'لم يقم أي عميل بكتابة تقييم على منتجاتك حتى الآن.' : 'No customer has registered feedback on any products yet.')}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filtered.map((item) => {
                      const r = item.review;
                      const p = item.product;

                      return (
                        <div key={`${p.id}-${r.id}`} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group overflow-hidden">
                          <div className="absolute top-0 right-0 left-0 h-1 bg-slate-105 group-hover:bg-emerald-500 transition-colors"></div>
                          
                          <div>
                            {/* Reviewer Header */}
                            <div className="flex items-center justify-between gap-4 mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center font-bold text-sm tracking-wide shrink-0">
                                  {r.userName ? r.userName.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-850 text-xs sm:text-sm">{r.userName || (isRtl ? 'عميل مجهول' : 'Anonymous')}</h4>
                                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{r.date ? new Date(r.date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                                </div>
                              </div>

                              {/* Stars */}
                              <div className="flex items-center gap-0.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-100 shrink-0">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`w-3.5 h-3.5 ${
                                      s <= r.rating
                                        ? 'fill-amber-400 stroke-amber-500'
                                        : 'text-slate-200'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>

                            {/* Comment */}
                            <p className="text-slate-600 text-xs leading-relaxed bg-slate-50 border border-slate-100/60 rounded-2xl p-4 font-sans break-words mb-5 whitespace-pre-wrap">
                              {r.comment || <span className="italic text-slate-400">{isRtl ? 'بدون تعليق مكتوب' : 'No written comment provided'}</span>}
                            </p>
                          </div>

                          {/* Product Context Footer */}
                          <div className="flex items-center justify-between gap-3 border-t border-slate-100/80 pt-4 mt-auto">
                            <div className="flex items-center gap-2.5">
                              {p.image ? (
                                <img
                                  src={p.image}
                                  alt={p.titleEn}
                                  className="w-8 h-8 rounded-lg object-contain border border-slate-100 p-[3%] shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                              <div className="max-w-[130px] sm:max-w-[200px]">
                                <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider leading-none mb-1">{isRtl ? 'المنتج المرتبط:' : 'Related item:'}</span>
                                <span className="text-xs font-semibold text-slate-700 block truncate leading-tight select-none">
                                  {isRtl ? p.titleAr : p.titleEn}
                                </span>
                              </div>
                            </div>

                            {/* Delete Review Button */}
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm(isRtl ? 'هل أنت متأكد من رغبتك في حذف هذا التقييم نهائياً؟' : 'Are you sure you want to permanently delete this review?')) {
                                  const updatedReviews = (p.reviews || []).filter((reviewItem) => reviewItem.id !== r.id);
                                  setIsAdminActionLoading(true);
                                  try {
                                    await onEditProduct(p.id, { reviews: updatedReviews });
                                  } catch (err) {
                                    console.error('Failed to delete review:', err);
                                  } finally {
                                    setIsAdminActionLoading(false);
                                  }
                                }
                              }}
                              disabled={isAdminActionLoading}
                              className="text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl transition-all border border-slate-100 flex items-center gap-1 shrink-0 disabled:opacity-40"
                              title={isRtl ? 'حذف التقييم' : 'Delete Review'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold hidden sm:inline">{isRtl ? 'حذف' : 'Delete'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* SALES REPORT TAB */}
        {activeTab === 'sales_report' && (() => {
          // 1. Filter orders based on selected time period (excluding cancelled orders)
          const now = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          const sevenDaysAgo = now - 7 * oneDayMs;
          const thirtyDaysAgo = now - 30 * oneDayMs;
          const threeSixtyFiveDaysAgo = now - 365 * oneDayMs;

          // Helper to get reliable order timestamp from ID or date string
          const getOrderTimestamp = (order: Order): number => {
            const idParts = order.id.split('-');
            if (idParts[0] === 'ord' && idParts[1] && !isNaN(Number(idParts[1]))) {
              return Number(idParts[1]);
            }
            const parsed = Date.parse(order.date);
            if (!isNaN(parsed)) {
              return parsed;
            }
            return now; // fallback to current time
          };

          const filteredByTimeOrders = orders.filter(order => {
            if (order.status === 'cancelled') return false;
            
            const orderTime = getOrderTimestamp(order);
            if (timeFilter === 'weekly' && orderTime < sevenDaysAgo) return false;
            if (timeFilter === 'monthly' && orderTime < thirtyDaysAgo) return false;
            if (timeFilter === 'yearly' && orderTime < threeSixtyFiveDaysAgo) return false;
            
            return true;
          });

          // 2. Aggregate sales per product
          const statsMap: Record<string, {
            product: Product;
            quantitySold: number;
            revenue: number;
            cost: number;
            profit: number;
          }> = {};

          // Initialize with all existing products
          products.forEach(p => {
            statsMap[p.id] = {
              product: p,
              quantitySold: 0,
              revenue: 0,
              cost: 0,
              profit: 0
            };
          });

          // Process filtered orders
          filteredByTimeOrders.forEach(order => {
            order.items.forEach(item => {
              if (!statsMap[item.productId]) {
                statsMap[item.productId] = {
                  product: {
                    id: item.productId,
                    titleAr: item.titleAr,
                    titleEn: item.titleEn,
                    descriptionAr: '',
                    descriptionEn: '',
                    price: item.price,
                    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600',
                    category: 'other',
                    categoryAr: 'أخرى',
                    stock: 0,
                    costPrice: item.costPrice || 0
                  },
                  quantitySold: 0,
                  revenue: 0,
                  cost: 0,
                  profit: 0
                };
              }
              
              const entry = statsMap[item.productId];
              entry.quantitySold += item.quantity;
              
              const itemRevenue = item.price * item.quantity;
              entry.revenue += itemRevenue;
              
              // Prioritize the recorded historical costPrice, fall back to current product catalog costPrice
              const unitCost = item.costPrice !== undefined ? item.costPrice : (entry.product.costPrice || 0);
              const itemCost = unitCost * item.quantity;
              entry.cost += itemCost;
              entry.profit += (itemRevenue - itemCost);
            });
          });

          // 3. Filter with search term and sort
          let statsList = Object.values(statsMap).filter(item => {
            if (!statsSearchTerm) return true;
            const term = statsSearchTerm.toLowerCase();
            return (
              item.product.titleAr.toLowerCase().includes(term) ||
              item.product.titleEn.toLowerCase().includes(term) ||
              item.product.id.toLowerCase().includes(term) ||
              (item.product.barcode && item.product.barcode.toLowerCase().includes(term))
            );
          });

          if (statsSortKey === 'qty') {
            statsList.sort((a, b) => b.quantitySold - a.quantitySold);
          } else if (statsSortKey === 'profit') {
            statsList.sort((a, b) => b.profit - a.profit);
          } else {
            statsList.sort((a, b) => b.revenue - a.revenue);
          }

          // 4. Summaries
          const totalItemsSoldPeriod = statsList.reduce((sum, item) => sum + item.quantitySold, 0);
          const totalRevenuePeriod = statsList.reduce((sum, item) => sum + item.revenue, 0);
          const totalCostPeriod = statsList.reduce((sum, item) => sum + item.cost, 0);
          const totalProfitPeriod = statsList.reduce((sum, item) => sum + item.profit, 0);

          const currencyStr = isRtl ? (settings.currencyAr || 'د.ج') : (settings.currencyEn || 'DZD');

          return (
            <div className="max-w-6xl mx-auto py-4 animate-fade-in space-y-6">
              {/* Header Title & Actions */}
              <div className="border-b border-slate-100 pb-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-850 tracking-tight">
                    {isRtl ? '📈 تقارير أرباح ومبيعات المنتجات المباشرة' : '📈 Live Product Sales & Profit Ledger'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {isRtl 
                      ? 'تتبع شامل لعدد المبيعات، ومجموع المداخيل، وتكاليف الشراء والربح الصافي الحقيقي للقطع والمنتجات أسبوعياً، شهرياً، وسنوياً.'
                      : 'Comprehensive overview of units sold, cost basis, generated revenue, and real net profit margins for each product weekly, monthly, and yearly.'}
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      const filterNames = {
                        weekly: isRtl ? 'الأسبوعي (آخر 7 أيام)' : 'Weekly (Last 7 Days)',
                        monthly: isRtl ? 'الشهري (آخر 30 يوماً)' : 'Monthly (Last 30 Days)',
                        yearly: isRtl ? 'السنوي (آخر 365 يوماً)' : 'Yearly (Last 365 Days)',
                        all: isRtl ? 'الشامل (كل الأوقات)' : 'All Time (Full History)',
                      };
                      
                      const printWindow = window.open('', '_blank');
                      if (!printWindow) {
                        alert(isRtl ? 'الرجاء تمكين النوافذ المنبثقة من المتصفح لطباعة التقرير!' : 'Please allow popup windows to generate report print sheets!');
                        return;
                      }
                      
                      const tableRowsHtml = statsList.map((item, index) => {
                        const margin = item.revenue > 0 ? Math.round((item.profit / item.revenue) * 100) : 0;
                        return `
                          <tr>
                            <td>${index + 1}</td>
                            <td>
                              <div style="font-weight: bold;">${isRtl ? item.product.titleAr : item.product.titleEn}</div>
                              <div style="font-size: 10px; color: #64748b;">ID: ${item.product.id}</div>
                            </td>
                            <td>${isRtl ? item.product.categoryAr : item.product.category}</td>
                            <td style="text-align: center; font-weight: bold;">${item.quantitySold}</td>
                            <td style="text-align: right; font-family: monospace;">${item.revenue.toFixed(2)} ${currencyStr}</td>
                            <td style="text-align: right; font-family: monospace;">${item.cost.toFixed(2)} ${currencyStr}</td>
                            <td style="text-align: right; font-family: monospace; font-weight: bold; color: ${item.profit >= 0 ? '#10b981' : '#ef4444'}">
                              ${item.profit.toFixed(2)} ${currencyStr}
                            </td>
                            <td style="text-align: center; font-family: monospace; font-size: 11px;">${margin}%</td>
                          </tr>
                        `;
                      }).join('');

                      const storeLogoHtml = settings.logoUrl ? `<img src="${settings.logoUrl}" style="max-height: 50px; margin-bottom: 8px;" alt="Logo" />` : '';

                      const htmlContent = `
                        <!DOCTYPE html>
                        <html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
                        <head>
                          <meta charset="UTF-8">
                          <title>${isRtl ? 'تقرير المبيعات والربحية للمنتجات' : 'Product Sales & Profits Report'}</title>
                          <style>
                            body {
                              font-family: system-ui, -apple-system, sans-serif;
                              color: #1e293b;
                              margin: 0;
                              padding: 40px;
                              direction: ${isRtl ? 'rtl' : 'ltr'};
                            }
                            .report-box {
                              max-width: 1000px;
                              margin: auto;
                            }
                            .header {
                              display: flex;
                              justify-content: space-between;
                              align-items: center;
                              border-bottom: 2px solid #e2e8f0;
                              padding-bottom: 20px;
                              margin-bottom: 25px;
                            }
                            .store-name {
                              font-size: 24px;
                              font-weight: bold;
                              color: #0f172a;
                            }
                            .report-title {
                              font-size: 18px;
                              color: #475569;
                              margin-top: 5px;
                            }
                            .meta {
                              text-align: ${isRtl ? 'left' : 'right'};
                              font-size: 13px;
                              color: #64748b;
                              line-height: 1.5;
                            }
                            .summary-grid {
                              display: grid;
                              grid-template-columns: repeat(4, 1fr);
                              gap: 15px;
                              margin-bottom: 30px;
                            }
                            .summary-card {
                              background: #f8fafc;
                              border: 1px solid #e2e8f0;
                              border-radius: 12px;
                              padding: 15px;
                              text-align: center;
                            }
                            .summary-label {
                              font-size: 11px;
                              color: #64748b;
                              text-transform: uppercase;
                              font-weight: bold;
                              margin-bottom: 5px;
                            }
                            .summary-value {
                              font-size: 18px;
                              font-weight: bold;
                              color: #0f172a;
                              font-family: monospace;
                            }
                            table {
                              width: 100%;
                              border-collapse: collapse;
                              margin-bottom: 30px;
                            }
                            th, td {
                              padding: 12px 10px;
                              text-align: ${isRtl ? 'right' : 'left'};
                              border-bottom: 1px solid #e2e8f0;
                              font-size: 13px;
                            }
                            th {
                              background-color: #f1f5f9;
                              color: #334155;
                              font-weight: bold;
                            }
                            .footer {
                              text-align: center;
                              margin-top: 50px;
                              font-size: 11px;
                              color: #94a3b8;
                              border-top: 1px solid #cbd5e1;
                              padding-top: 20px;
                            }
                            @media print {
                              .no-print {
                                display: none;
                              }
                              body {
                                padding: 0;
                              }
                            }
                          </style>
                        </head>
                        <body>
                          <div class="report-box">
                            <div class="header">
                              <div>
                                ${storeLogoHtml}
                                <div class="store-name">${isRtl ? settings.storeNameAr : settings.storeNameEn}</div>
                                <div class="report-title">${isRtl ? 'تقرير أرباح ومبيعات المنتجات تفصيلياً' : 'Detailed Product Sales & Profits Report'}</div>
                              </div>
                              <div class="meta">
                                <div><strong>${isRtl ? 'نوع التقرير:' : 'Period Type:'}</strong> ${filterNames[timeFilter]}</div>
                                <div><strong>${isRtl ? 'تاريخ التوليد:' : 'Generated At:'}</strong> ${new Date().toLocaleString(isRtl ? 'ar-SA' : 'en-US')}</div>
                                <button onclick="window.print()" class="no-print" style="margin-top: 10px; background: #059669; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold;">
                                  ${isRtl ? '🖨️ طباعة التقرير الفورية' : '🖨️ Open Print Handler'}
                                </button>
                              </div>
                            </div>
                            
                            <div class="summary-grid">
                              <div class="summary-card">
                                <div class="summary-label">${isRtl ? 'إجمالي المبيعات' : 'Total Revenue'}</div>
                                <div class="summary-value" style="color: #1e3a8a;">${totalRevenuePeriod.toFixed(2)} ${currencyStr}</div>
                              </div>
                              <div class="summary-card">
                                <div class="summary-label">${isRtl ? 'التكلفة الإجمالية' : 'Total Cost'}</div>
                                <div class="summary-value">${totalCostPeriod.toFixed(2)} ${currencyStr}</div>
                              </div>
                              <div class="summary-card">
                                <div class="summary-label">${isRtl ? 'صافي الأرباح الكلية' : 'Net Profits'}</div>
                                <div class="summary-value" style="color: #059669;">${totalProfitPeriod.toFixed(2)} ${currencyStr}</div>
                              </div>
                              <div class="summary-card">
                                <div class="summary-label">${isRtl ? 'القطع المباعة' : 'Units Sold'}</div>
                                <div class="summary-value" style="color: #854d0e;">${totalItemsSoldPeriod}</div>
                              </div>
                            </div>
                            
                            <table>
                              <thead>
                                <tr>
                                  <th style="width: 40px;">#</th>
                                  <th>${isRtl ? 'المنتج' : 'Product'}</th>
                                  <th>${isRtl ? 'التصنيف' : 'Category'}</th>
                                  <th style="text-align: center;">${isRtl ? 'الكمية المباعة' : 'Qty Sold'}</th>
                                  <th style="text-align: right;">${isRtl ? 'الإيرادات' : 'Revenue'}</th>
                                  <th style="text-align: right;">${isRtl ? 'التكلفة' : 'Cost'}</th>
                                  <th style="text-align: right;">${isRtl ? 'صافي الأرباح' : 'Net Profit'}</th>
                                  <th style="text-align: center;">${isRtl ? 'هامش الربح' : 'Margin'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${tableRowsHtml}
                              </tbody>
                            </table>
                            
                            <div class="footer">
                              <p>${isRtl ? settings.storeNameAr : settings.storeNameEn} &copy; ${new Date().getFullYear()} - ${isRtl ? 'لوحة تحكم حصرية لإدارة المبيعات والمنتجات' : 'Confidential Sales Ledger Dashboard'}</p>
                            </div>
                          </div>
                        </body>
                        </html>
                      `;
                      
                      printWindow.document.open();
                      printWindow.document.write(htmlContent);
                      printWindow.document.close();
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all border border-slate-200"
                  >
                    <Printer className="w-4 h-4 text-slate-550" />
                    <span>{isRtl ? 'طباعة التقرير 🖨️' : 'Print Report 🖨️'}</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      const filename = `sales_report_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
                      
                      const headers = isRtl 
                        ? ['معرف المنتج', 'اسم المنتج (عربي)', 'اسم المنتج (إنجليزي)', 'الكمية المباعة', 'إجمالي الإيرادات', 'رأس مال الشراء (التكلفة)', 'صافي الأرباح', 'هامش الربح (%)']
                        : ['Product ID', 'Product Title (AR)', 'Product Title (EN)', 'Units Sold', 'Total Revenue', 'Cost Amount', 'Net Profit', 'Profit Margin (%)'];
                        
                      const rows = statsList.map(item => {
                        const margin = item.revenue > 0 ? ((item.profit / item.revenue) * 100).toFixed(1) : '0.0';
                        return [
                          item.product.id,
                          `"${item.product.titleAr.replace(/"/g, '""')}"`,
                          `"${item.product.titleEn.replace(/"/g, '""')}"`,
                          item.quantitySold,
                          item.revenue,
                          item.cost,
                          item.profit,
                          `${margin}%`
                        ];
                      });
                      
                      const totalMargin = totalRevenuePeriod > 0 ? ((totalProfitPeriod / totalRevenuePeriod) * 100).toFixed(1) : '0.0';
                      rows.push([
                        'SUMMARY',
                        isRtl ? '"الإجمالي"' : '"TOTAL"',
                        '""',
                        totalItemsSoldPeriod,
                        totalRevenuePeriod,
                        totalCostPeriod,
                        totalProfitPeriod,
                        `${totalMargin}%`
                      ]);
                      
                      const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", filename);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isRtl ? 'تحميل جدول المبيعات 📥' : 'Download CSV Sheet 📥'}</span>
                  </button>
                </div>
              </div>

              {/* Time Period Filter Tabs */}
              <div className="flex bg-slate-100/80 p-1 rounded-2xl max-w-md border border-slate-200/40">
                {(['weekly', 'monthly', 'yearly', 'all'] as const).map((period) => {
                  const labelMap = {
                    weekly: isRtl ? 'أسبوعي' : 'Weekly',
                    monthly: isRtl ? 'شهري' : 'Monthly',
                    yearly: isRtl ? 'سنوي' : 'Yearly',
                    all: isRtl ? 'كل الأوقات' : 'All History'
                  };
                  return (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setTimeFilter(period)}
                      className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all ${
                        timeFilter === period
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {labelMap[period]}
                    </button>
                  );
                })}
              </div>

              {/* Metric Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-tight">{isRtl ? 'إجمالي المبيعات' : 'Total Revenue'}</span>
                    <span className="text-lg sm:text-2xl font-bold font-mono text-slate-800 block">{totalRevenuePeriod.toFixed(2)} {currencyStr}</span>
                  </div>
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-tight">{isRtl ? 'تكلفة السلع المباعة' : 'Cost of Goods'}</span>
                    <span className="text-lg sm:text-2xl font-bold font-mono text-slate-800 block">{totalCostPeriod.toFixed(2)} {currencyStr}</span>
                  </div>
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-tight">{isRtl ? 'صافي الأرباح الصافية' : 'Net Profits'}</span>
                    <span className={`text-lg sm:text-2xl font-bold font-mono block ${totalProfitPeriod >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {totalProfitPeriod.toFixed(2)} {currencyStr}
                    </span>
                  </div>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-tight">{isRtl ? 'القطع الكلية المباعة' : 'Volume Traded'}</span>
                    <span className="text-lg sm:text-2xl font-bold font-mono text-slate-800 block">{totalItemsSoldPeriod}</span>
                  </div>
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Table Toolbar (Search & Sort) */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  {/* Search bar */}
                  <div className="relative w-full md:max-w-md">
                    <Search className={`absolute top-3.5 w-4 h-4 text-slate-400 ${isRtl ? 'right-3.5' : 'left-3.5'}`} />
                    <input
                      type="text"
                      value={statsSearchTerm}
                      onChange={(e) => setStatsSearchTerm(e.target.value)}
                      placeholder={isRtl ? 'ابحث باسم المنتج، المعرف أو الباركود...' : 'Search by name, ID or barcode...'}
                      className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 text-xs text-slate-800 placeholder-slate-455 focus:outline-none focus:border-emerald-500 focus:bg-white ${
                        isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                      }`}
                    />
                  </div>

                  {/* Sorting dropdown */}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <span className="text-xs text-slate-500 shrink-0 font-bold">{isRtl ? 'ترتيب حسب:' : 'Sort by:'}</span>
                    <select
                      value={statsSortKey}
                      onChange={(e) => setStatsSortKey(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                    >
                      <option value="revenue">{isRtl ? 'إجمالي المبيعات' : 'Sales Revenue'}</option>
                      <option value="profit">{isRtl ? 'صافي الأرباح' : 'Net Profits'}</option>
                      <option value="qty">{isRtl ? 'الكمية المباعة' : 'Quantity Sold'}</option>
                    </select>
                  </div>
                </div>

                {/* Table list */}
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-start border-collapse" dir={isRtl ? 'rtl' : 'ltr'}>
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 text-xs font-bold">
                        <th className="px-6 py-4 text-start">{isRtl ? 'المنتج' : 'Product'}</th>
                        <th className="px-6 py-4 text-start">{isRtl ? 'التصنيف' : 'Category'}</th>
                        <th className="px-6 py-4 text-center">{isRtl ? 'المخزون الحالي' : 'Stock'}</th>
                        <th className="px-6 py-4 text-center">{isRtl ? 'الكمية المباعة' : 'Units Sold'}</th>
                        <th className="px-6 py-4 text-end">{isRtl ? 'الإيرادات' : 'Revenue'}</th>
                        <th className="px-6 py-4 text-end">{isRtl ? 'التكلفة بالكامل' : 'Combined Cost'}</th>
                        <th className="px-6 py-4 text-end">{isRtl ? 'صافي الأرباح' : 'Net Profit'}</th>
                        <th className="px-6 py-4 text-center">{isRtl ? 'هامش الأرباح' : 'Net Margin'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statsList.map((item) => {
                        const marginPercent = item.revenue > 0 ? Math.round((item.profit / item.revenue) * 100) : 0;
                        const isLowStock = item.product.stock <= 5;
                        return (
                          <tr key={item.product.id} className="text-xs sm:text-sm hover:bg-slate-50/50 transition-all">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={item.product.image}
                                  alt={item.product.titleEn}
                                  className="w-9 h-9 object-contain rounded-xl border border-slate-150 p-[3%]"
                                />
                                <div className="text-right sm:text-left">
                                  <div className="font-bold text-slate-800 line-clamp-1">{isRtl ? item.product.titleAr : item.product.titleEn}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">ID: {item.product.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg block w-max">
                                {isRtl ? item.product.categoryAr : item.product.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-mono">
                              <span className={`font-bold ${isLowStock ? 'text-rose-500 font-extrabold animate-pulse' : 'text-slate-600'}`}>
                                {item.product.stock} {isLowStock && isRtl && '⚠️ (منخفض)'} {isLowStock && !isRtl && '⚠️ (low)'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-bold font-mono text-slate-700">
                              {item.quantitySold}
                            </td>
                            <td className="px-6 py-4 text-end font-mono text-slate-700">
                              {item.revenue.toFixed(2)} {currencyStr}
                            </td>
                            <td className="px-6 py-4 text-end font-mono text-slate-450">
                              {item.cost.toFixed(2)} {currencyStr}
                            </td>
                            <td className={`px-6 py-4 text-end font-mono font-bold ${item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.profit.toFixed(2)} {currencyStr}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full font-mono ${
                                marginPercent >= 40 
                                  ? 'bg-emerald-50 text-emerald-700' 
                                  : marginPercent >= 20 
                                  ? 'bg-blue-50 text-blue-700' 
                                  : marginPercent > 0 
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-stone-105 text-stone-500 bg-slate-100'
                              }`}>
                                {marginPercent}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                      {statsList.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">
                            {isRtl ? '⚠️ لا توجد نتائج مطابقة لتقارير المبيعات في هذه الفترة.' : '⚠️ No matches within this period of records.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ADMINISTRATIVE STAFF MANAGEMENT TAB */}
        {activeTab === 'staff' && isSuper && (
          <div className="max-w-6xl mx-auto py-4 animate-fade-in space-y-8">
            <div className="border-b border-slate-105 pb-5">
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                {isRtl ? 'إدارة الموظفين والصلاحيات' : 'Administrative Staff & Roles'}
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                {isRtl 
                  ? 'إضافة كوادر إدارية جديدة بصلاحيات جزئية (التحكم بالمنتجات والطلبات والتقييمات بالكامل، باستثناء إعدادات المتجر وهوية المدير المسؤول).' 
                  : 'Register staff members with partial access (full product and order controls, except settings and owner branding).'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Register New Staff Form */}
              <div className="lg:col-span-5 bg-white border border-slate-150 rounded-3xl p-6 shadow-xs h-fit">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900">
                    {isRtl ? 'تسجيل موظف جديد' : 'Register New Staff'}
                  </h3>
                </div>

                <form onSubmit={handleRegisterStaff} className="space-y-4">
                  {staffError && (
                    <div className="p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 text-xs font-semibold">
                      ⚠️ {staffError}
                    </div>
                  )}

                  {staffSuccess && (
                    <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 text-xs font-semibold">
                      🎉 {staffSuccess}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      {isRtl ? 'الاسم بالكامل (العربية) *' : 'Full Name (Arabic) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={newStaffNameAr}
                      onChange={(e) => setNewStaffNameAr(e.target.value)}
                      placeholder={isRtl ? 'مثال: أحمد العتيبي' : 'e.g. أحمد العتيبي'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      {isRtl ? 'الاسم بالكامل (الإنجليزية) *' : 'Full Name (English) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={newStaffNameEn}
                      onChange={(e) => setNewStaffNameEn(e.target.value)}
                      placeholder={isRtl ? 'مثال: Ahmad Alotaibi' : 'e.g. Ahmad Alotaibi'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      {isRtl ? 'اسم المستخدم (لتسجيل الدخول) *' : 'Username (identifier) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={newStaffUser}
                      onChange={(e) => setNewStaffUser(e.target.value)}
                      placeholder={isRtl ? 'مثال: ahmad_admin' : 'e.g. ahmad_admin'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      {isRtl ? 'رمز أو كلمة المرور للموظف (PIN) *' : 'Staff Passcode / PIN *'}
                    </label>
                    <input
                      type="password"
                      required
                      value={newStaffPass}
                      onChange={(e) => setNewStaffPass(e.target.value)}
                      placeholder="••••"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 placeholder-slate-400 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {isRtl ? 'هذا هو الرمز الذي سيستخدمه الموظف للدخول من شاشة قفل الإدارة.' : 'This passcode will authorize this employee to access the dashboard.'}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <label className="block text-xs font-bold text-slate-700">
                      {isRtl ? 'صلاحيات الوصول للأقسام *' : 'Section Access Permissions *'}
                    </label>
                    <p className="text-[10px] text-slate-400">
                      {isRtl ? 'اختر الأقسام التي يُسمح لهذا الموظف برؤيتها وإدارتها.' : 'Select the sections this staff member is authorized to view and manage.'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {[
                        { id: 'stats', labelAr: 'الإحصائيات 📊', labelEn: 'Stats 📊' },
                        { id: 'products', labelAr: 'المنتجات 🛍️', labelEn: 'Products 🛍️' },
                        { id: 'orders', labelAr: 'الطلبات 📦', labelEn: 'Orders 📦' },
                        { id: 'sales_report', labelAr: 'تقرير المبيعات 📈', labelEn: 'Sales & Profits 📈' },
                        { id: 'reviews', labelAr: 'التقييمات والآراء 💬', labelEn: 'Reviews 💬' },
                      ].map((item) => {
                        const isChecked = newStaffAllowedTabs.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none ${
                              isChecked
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  if (newStaffAllowedTabs.length > 1) {
                                    setNewStaffAllowedTabs(newStaffAllowedTabs.filter(id => id !== item.id));
                                  }
                                } else {
                                  setNewStaffAllowedTabs([...newStaffAllowedTabs, item.id]);
                                }
                              }}
                              className="accent-emerald-600 rounded text-emerald-600"
                            />
                            <span>{isRtl ? item.labelAr : item.labelEn}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAdminActionLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-40"
                  >
                    {isRtl ? 'إدراج وتفعيل الموظف' : 'Register & Activate Staff'}
                  </button>
                </form>
              </div>

              {/* Right Column: Staff Members List Deck */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h3 className="font-bold text-slate-900 text-lg">
                    {isRtl ? `الموظفون الحاليون (${staff.length})` : `Active Employee Roster (${staff.length})`}
                  </h3>
                </div>

                {staff.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-8 text-center">
                    <p className="text-slate-400 text-sm">
                      {isRtl ? 'لم يتم تسجيل أي موظف إداري بعد.' : 'No administrative staff profiles created yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {staff.map((employee) => {
                      const EmployeeName = isRtl ? employee.nameAr : employee.nameEn;
                      const initials = (employee.nameEn || employee.nameAr).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <div key={employee.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:border-slate-200 transition-all space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                                {initials || 'ST'}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 text-sm">
                                  {EmployeeName}
                                </h4>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                                  <span>@{employee.username}</span>
                                  <span>•</span>
                                  <span>PIN: <span className="bg-slate-100 px-1.5 py-0.5 rounded-md font-bold text-slate-600 tracking-wider">{employee.passcode}</span></span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm(isRtl ? `هل أنت متأكد من رغبتك في سحب صلاحيات الموظف (${employee.nameAr}) وحذف حسابه نهائياً؟` : `Are you sure you want to deactivate and permanently delete ${employee.nameEn}?`)) {
                                  if (onDeleteStaff) {
                                    try {
                                      await onDeleteStaff(employee.id);
                                    } catch (err: any) {
                                      alert(getErrorDescription(err));
                                    }
                                  }
                                }
                              }}
                              className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100"
                              title={isRtl ? 'حذف الموظف' : 'Remove employee'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Inline permissions toggle */}
                          <div className="pt-3 border-t border-slate-50 space-y-2">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {isRtl ? 'صلاحيات الأقسام المفعلة (انقر للتعديل):' : 'Active Section Privileges (Click to toggle):'}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { id: 'stats', labelAr: 'الإحصائيات', labelEn: 'Stats' },
                                { id: 'products', labelAr: 'المنتجات', labelEn: 'Products' },
                                { id: 'orders', labelAr: 'الطلبات', labelEn: 'Orders' },
                                { id: 'sales_report', labelAr: 'تقرير المبيعات', labelEn: 'Sales & Profits' },
                                { id: 'reviews', labelAr: 'التقييمات والآراء', labelEn: 'Reviews' },
                              ].map((sec) => {
                                const currentAllowed = employee.allowedTabs || ['stats', 'products', 'orders', 'sales_report', 'reviews'];
                                const isPermitted = currentAllowed.includes(sec.id);
                                return (
                                  <button
                                    key={sec.id}
                                    type="button"
                                    onClick={async () => {
                                      let updatedAllowed: string[];
                                      if (isPermitted) {
                                        if (currentAllowed.length <= 1) return;
                                        updatedAllowed = currentAllowed.filter(id => id !== sec.id);
                                      } else {
                                        updatedAllowed = [...currentAllowed, sec.id];
                                      }
                                      
                                      if (onAddStaff) {
                                        try {
                                          await onAddStaff({
                                            ...employee,
                                            allowedTabs: updatedAllowed
                                          });
                                        } catch (err: any) {
                                          alert(getErrorDescription(err));
                                        }
                                      }
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all border flex items-center gap-1 ${
                                      isPermitted
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isPermitted ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                    <span>{isRtl ? sec.labelAr : sec.labelEn}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-100 py-6 mt-12 text-center text-xs text-slate-400 font-mono">
        <p>© 2026 {lang === 'ar' ? settings.storeNameAr : settings.storeNameEn} • {isRtl ? 'لوحة تحكم آمنة بنسبة 100%' : '100% Safe Admin Engine'}</p>
      </footer>

      {/* PRODUCT ADD/EDIT INSTANT MODAL */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingProduct ? dict.editProduct : dict.addProduct}
              </h3>
              <button 
                onClick={() => setShowProductModal(false)}
                className="bg-slate-50 hover:bg-slate-100 text-slate-450 p-2 rounded-lg transition-all border border-slate-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Titles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{dict.productTitleAr}</label>
                  <input 
                    type="text" 
                    required
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{dict.productTitleEn}</label>
                  <input 
                    type="text" 
                    required
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{dict.descriptionAr}</label>
                <textarea 
                  rows={2}
                  value={descriptionAr}
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{dict.descriptionEn}</label>
                <textarea 
                  rows={2}
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none"
                />
              </div>

              {/* Recipe & Ingredients Attachment Section */}
              <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center gap-2 border-b border-amber-200/80 pb-2">
                  <span className="text-xl">📜</span>
                  <div>
                    <h4 className="text-xs font-black text-amber-950">
                      {isRtl ? 'وصفة تحضير الحلوى والمكونات (ميزة مرفقة للمنتج)' : 'Sweets Recipe & Ingredients (Product Attachment)'}
                    </h4>
                    <p className="text-[10px] text-amber-800">
                      {isRtl ? 'إرفاق المقادير وطريقة التحضير بالخطوات ليتمكن الزبائن من مشاهدتها وحفظها في المتجر' : 'Attach ingredients & recipe steps for customers to view and save on storefront'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isRtl ? 'المكونات والمقادير (بالعربية)' : 'Ingredients (Arabic)'}
                    </label>
                    <textarea 
                      rows={3}
                      value={ingredientsAr}
                      onChange={(e) => setIngredientsAr(e.target.value)}
                      placeholder={isRtl ? 'مثال: 1 كغ فرينة، 250غ سمن، لوز وجوز، ماء زهر...' : 'Ingredients list...'}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isRtl ? 'المكونات والمقادير (بالإنجليزية)' : 'Ingredients (English)'}
                    </label>
                    <textarea 
                      rows={3}
                      value={ingredientsEn}
                      onChange={(e) => setIngredientsEn(e.target.value)}
                      placeholder="Ingredients in English..."
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 resize-y"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isRtl ? 'خطوات طريقة التحضير (بالعربية)' : 'Recipe Steps (Arabic)'}
                    </label>
                    <textarea 
                      rows={4}
                      value={recipeAr}
                      onChange={(e) => setRecipeAr(e.target.value)}
                      placeholder={isRtl ? '1. نخلط العجين ونتركه يرتاح...\n2. نجهز العقدة...' : 'Recipe steps...'}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isRtl ? 'خطوات طريقة التحضير (بالإنجليزية)' : 'Recipe Steps (English)'}
                    </label>
                    <textarea 
                      rows={4}
                      value={recipeEn}
                      onChange={(e) => setRecipeEn(e.target.value)}
                      placeholder="Recipe steps in English..."
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 resize-y"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      ⏱️ {isRtl ? 'مدة التحضير والطهي' : 'Preparation Time'}
                    </label>
                    <input 
                      type="text"
                      value={preparationTime}
                      onChange={(e) => setPreparationTime(e.target.value)}
                      placeholder={isRtl ? 'مثال: 45 دقيقة' : 'e.g. 45 mins'}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      ⭐ {isRtl ? 'مستوى صعوبة التحضير' : 'Recipe Difficulty'}
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="easy">🟢 {isRtl ? 'سهل (سريعة التحضير)' : 'Easy'}</option>
                      <option value="medium">🟡 {isRtl ? 'متوسط (حلوى تقليدية)' : 'Medium'}</option>
                      <option value="hard">🔴 {isRtl ? 'صعب (احترافية للأعراس)' : 'Hard (Professional)'}</option>
                    </select>
                  </div>
                </div>

                {/* Show/Hide Recipe to Customers Toggle */}
                <div className="flex items-center justify-between bg-white/90 p-3.5 rounded-xl border border-amber-300 shadow-2xs mt-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">👁️</span>
                    <div>
                      <span className="text-xs font-black text-amber-950 block">
                        {isRtl ? 'إظهار الوصفة والمكونات للزبائن في المتجر' : 'Show recipe & ingredients to customers'}
                      </span>
                      <span className="text-[10px] text-slate-600 block leading-snug">
                        {isRtl ? 'عند تفعيل الخيار، تظهر أزرار "وصفة الحلوى" للزبائن على البطاقات والمتجر. عند تعطيله، تظل الوصفة محفوظة للأدمن فقط.' : 'When enabled, recipe badges and buttons are visible to customers on storefront. When disabled, kept private for admin.'}
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox"
                      checked={showRecipeToCustomers}
                      onChange={(e) => setShowRecipeToCustomers(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
              </div>

              {/* Price, Discount Price, Cost Price & Stock */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{dict.priceLabel}</label>
                  <input 
                    type="number" 
                    required
                    min={1}
                    value={price || ''}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1 text-rose-600">
                    {isRtl ? 'سعر التخفيض' : 'Discount Price'}
                  </label>
                  <input 
                    type="number" 
                    min={0}
                    value={discountPrice || ''}
                    onChange={(e) => setDiscountPrice(Number(e.target.value))}
                    placeholder={isRtl ? '0 للإلغاء' : '0 to disable'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-rose-500 focus:bg-white placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 text-emerald-600">
                    {isRtl ? 'سعر الشراء' : 'Cost Price'}
                  </label>
                  <input 
                    type="number" 
                    min={0}
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(Number(e.target.value))}
                    placeholder={isRtl ? 'سعر التكلفة' : 'Cost amount'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{dict.stockLabel}</label>
                  <input 
                    type="number" 
                    required
                    min={0}
                    value={stock || '0'}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Barcode Section with auto generator and real-time preview rendering */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3.5">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      🏷️ {dict.barcodeLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        // Generate a high-fidelity random numeric/alpha barcode (e.g. UAE/Middle East country prefix for authentic EAN-like feeling)
                        const prefix = '629';
                        const randomDigits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
                        setBarcode(`${prefix}${randomDigits}`);
                      }}
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline font-bold transition flex items-center gap-1"
                    >
                      ⚡ {dict.generateBarcode}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder={dict.barcodePlaceholder}
                    className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-800 tracking-wider focus:outline-none focus:border-emerald-500 uppercase"
                  />
                </div>

                {/* Live SVG drawing preview */}
                {barcode.trim().length > 0 && (
                  <div className="flex flex-col items-center justify-center pt-1 animate-slide-up bg-white p-2.5 rounded-xl border border-slate-150">
                    <span className="text-[10px] text-slate-400 font-semibold mb-1.5">{isRtl ? 'معاينة الباركود للملصق والمطبوعات:' : 'Label sheet barcode preview:'}</span>
                    <BarcodeSVG value={barcode} />
                  </div>
                )}
              </div>

              {/* Category & Image Control block */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">{dict.categoryLabel}</label>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
                  >
                    <option value="electronics">{dict.categories.electronics}</option>
                    <option value="fashion">{dict.categories.fashion}</option>
                    <option value="home">{dict.categories.home}</option>
                    <option value="books">{dict.categories.books}</option>
                    <option value="sweets">{dict.categories.sweets}</option>
                    <option value="accessories">{dict.categories.accessories}</option>
                  </select>
                </div>

                {/* Weighted Product Toggle */}
                <div className="bg-amber-50/60 border border-amber-200/80 p-3 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚖️</span>
                    <div>
                      <span className="text-xs font-bold text-amber-950 block">
                        {isRtl ? 'البيع بالميزان (كيلوغرام / غرام)' : 'Sell by weight (kg/grams)'}
                      </span>
                      <span className="text-[10px] text-amber-800 block">
                        {isRtl ? 'يتيح للزبون الطلب بنصف كغ، 1 كغ، 2 كغ أو بالغرام والمبلغ' : 'Allows customer to order 0.5kg, 1kg, custom grams or amount in DZD'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isWeighted}
                    onChange={(e) => setIsWeighted(e.target.checked)}
                    className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {lang === 'ar' ? 'صورة المنتج' : 'Product Image'}
                  </label>
                  
                  {/* Selector Tabs */}
                  <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setImageInputMethod('upload');
                        setUploadError(null);
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        imageInputMethod === 'upload'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      📤 {lang === 'ar' ? 'رفع ملف' : 'Upload File'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageInputMethod('url');
                        setUploadError(null);
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        imageInputMethod === 'url'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      🌐 {lang === 'ar' ? 'رابط ويب' : 'Web URL'}
                    </button>
                  </div>

                  {/* Upload File view */}
                  {imageInputMethod === 'upload' ? (
                    <div className="space-y-3">
                      <div
                        onDragOver={handleImageDragOver}
                        onDragLeave={handleImageDragLeave}
                        onDrop={handleImageDrop}
                        onClick={() => document.getElementById('prod-img-uploaded')?.click()}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] ${
                          isDragOver
                            ? 'border-emerald-500 bg-emerald-50/40'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-350'
                        }`}
                      >
                        <input
                          type="file"
                          id="prod-img-uploaded"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageFileChange}
                          disabled={isUploadingImage}
                        />

                        {isUploadingImage ? (
                          <div className="flex flex-col items-center gap-2">
                            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                            <span className="text-xs text-slate-500 font-semibold">
                              {lang === 'ar' ? 'جاري معالجة وضغط الصورة...' : 'Processing and compressing image...'}
                            </span>
                          </div>
                        ) : image ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-150 shadow-sm bg-white">
                              <img
                                src={image}
                                alt="Preview"
                                className="w-full h-full object-contain p-[3%]"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="text-center">
                              <span className="text-xs text-emerald-600 font-bold block">
                                {lang === 'ar' ? '✨ تم تجهيز الصورة بنجاح' : '✨ Image processed successfully'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {lang === 'ar' ? '(اضغط لتحديث الصورة)' : '(Click to update image)'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-500 shadow-sm">
                              <Upload className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-700">
                                {lang === 'ar' ? 'اسحب الصورة هنا أو اضغط للاختيار' : 'Drag image here, or click to browse'}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {lang === 'ar' ? 'PNG, JPG أو WEBP (يتم التحسين تلقائياً)' : 'PNG, JPG or WEBP (optimized automatically)'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {uploadError && (
                        <p className="text-xs font-semibold text-rose-600 text-center">{uploadError}</p>
                      )}

                      {image && (
                        <div className="flex justify-between items-center bg-slate-50 border border-slate-150 p-2.5 rounded-xl">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                              {image.substring(0, 42)}...
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setImage('')}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all"
                          >
                            {lang === 'ar' ? 'مسح' : 'Clear'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Web URL view */
                    <div className="space-y-3">
                      <div className="relative">
                        <input 
                          type="url" 
                          required
                          placeholder={lang === 'ar' ? 'مثال: https://example.com/item.jpg' : 'e.g., https://example.com/item.jpg'}
                          value={image}
                          onChange={(e) => setImage(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-3 py-2.5 text-xs font-mono text-slate-850 focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                      
                      {image && image.startsWith('http') && (
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-150 p-2 rounded-xl">
                          <img 
                            src={image} 
                            alt="Preview URL" 
                            className="w-12 h-12 object-contain rounded-lg border border-slate-200 shrink-0 bg-white p-[3%]"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=150';
                            }}
                            referrerPolicy="no-referrer"
                          />
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                              {lang === 'ar' ? 'معاينة الرابط' : 'URL Preview'}
                            </p>
                            <p className="text-xs text-slate-600 font-mono truncate max-w-[260px]">{image}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Additional Images Section */}
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    🖼️ {lang === 'ar' ? 'صور إضافية للمنتج (اختياري)' : 'Additional Product Images (Optional)'}
                  </label>
                  
                  {/* Additional Images Thumbnails list */}
                  {additionalImages.length > 0 && (
                    <div className="grid grid-cols-5 gap-2.5 mb-3">
                      {additionalImages.map((imgUrl, index) => (
                        <div key={index} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-50">
                          <img 
                            src={imgUrl} 
                            alt={`Add preview ${index}`} 
                            className="w-full h-full object-contain p-[3%]"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=150';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveAdditionalImage(index)}
                            className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white rounded-xl"
                          >
                            <Trash2 className="w-4 h-4 text-rose-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Input for adding more images */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 space-y-2">
                    <div className="flex gap-1.5 p-0.5 bg-slate-200/60 rounded-lg mb-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAdditionalImageInputMethod('upload');
                          setAddUploadError(null);
                        }}
                        className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${
                          additionalImageInputMethod === 'upload'
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-850'
                        }`}
                      >
                        📤 {lang === 'ar' ? 'رفع صورة' : 'Upload Image'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdditionalImageInputMethod('url');
                          setAddUploadError(null);
                        }}
                        className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${
                          additionalImageInputMethod === 'url'
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-850'
                        }`}
                      >
                        🌐 {lang === 'ar' ? 'رابط ويب' : 'Web URL'}
                      </button>
                    </div>

                    {additionalImageInputMethod === 'upload' ? (
                      <div>
                        <input
                          type="file"
                          id="add-prod-img-upload"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAdditionalImageFileChange}
                          disabled={isUploadingAddImage}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('add-prod-img-upload')?.click()}
                          disabled={isUploadingAddImage}
                          className="w-full py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                        >
                          {isUploadingAddImage ? (
                            <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>
                            {isUploadingAddImage 
                              ? (lang === 'ar' ? 'جاري الرفع...' : 'Uploading...') 
                              : (lang === 'ar' ? 'اختر صورة لإضافتها' : 'Choose image to add')}
                          </span>
                        </button>
                        {addUploadError && (
                          <p className="text-[10px] font-semibold text-rose-600 text-center mt-1">{addUploadError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input 
                          type="url" 
                          placeholder={lang === 'ar' ? 'أدخل رابط الصورة ثم اضغط إضافة' : 'Enter image URL then click Add'}
                          value={newAddImageUrl}
                          onChange={(e) => setNewAddImageUrl(e.target.value)}
                          className="flex-1 bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddImageUrl}
                          disabled={!newAddImageUrl.trim()}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50"
                        >
                          {lang === 'ar' ? 'إضافة' : 'Add'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {adminActionError && (
                <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl font-semibold leading-relaxed border border-rose-200 font-sans">
                  {adminActionError}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isAdminActionLoading}
                  onClick={() => {
                    setShowProductModal(false);
                    setAdminActionError('');
                  }}
                  className="px-4 py-2 bg-slate-105 hover:bg-slate-150 text-slate-600 rounded-xl text-sm transition-all disabled:opacity-50"
                >
                  {dict.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isAdminActionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-md focus:outline-none disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isAdminActionLoading && (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  )}
                  <span>{dict.saveProduct}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SELECTED ORDER ITEMS DRAWER/MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden animate-slide-up">
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900">
                  {isRtl ? 'تفاصيل المنتجات للطلب:' : 'Products details for:'} <span className="font-mono text-emerald-600">#{selectedOrder.id.slice(0, 8)}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isRtl ? 'عميل: ' : 'Customer: '} {selectedOrder.customerName} | {selectedOrder.customerPhone}
                </p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="bg-slate-50 hover:bg-slate-100 text-slate-450 p-2 rounded-lg transition-all border border-slate-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedOrder.items.map((item, index) => {
                const matchedProduct = products.find(p => p.id === item.productId);
                return (
                  <div key={item.productId} className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all">
                    {matchedProduct && (
                      <img 
                        src={matchedProduct.image} 
                        alt={lang === 'ar' ? item.titleAr : item.titleEn}
                        className="w-16 h-16 rounded-lg object-contain bg-slate-100 p-[3%] flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-900 truncate">
                        {lang === 'ar' ? item.titleAr : item.titleEn}
                      </h4>
                      <div className="flex justify-between items-center mt-3 text-xs text-slate-500">
                        <span>{isRtl ? 'الكمية:' : 'Qty:'} <strong className="text-slate-800 font-mono text-sm">{item.quantity}</strong></span>
                        <span>{isRtl ? 'سعر القطعة:' : 'Unit price:'} <strong className="text-slate-800 font-mono text-sm">{item.price} {dict.currency}</strong></span>
                        <span>{isRtl ? 'المجموع:' : 'Line Total:'} <strong className="text-emerald-600 font-mono text-sm">{item.price * item.quantity} {dict.currency}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100/60 flex justify-between items-center text-sm font-bold">
                <span className="text-slate-800">{dict.total}</span>
                <span className="text-emerald-700 font-mono text-lg">{selectedOrder.total} {dict.currency}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(selectedOrder)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'فاتورة تفصيلية' : 'Full Invoice'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMiniThermalPrint(selectedOrder)}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'تيكيت ميني 📱' : 'Mini Ticket 📱'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrinterPairingGuide(true)}
                  className="px-2.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-all border border-blue-150 cursor-pointer"
                  title={isRtl ? 'كيفية اقتران الطابعة الحرارية' : 'Printer Pairing Guide'}
                >
                  <span>❓ {isRtl ? 'الاقتران' : 'Pairing'}</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                {dict.close}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOM DELETION CONFIRMATION MODAL */}
      {deleteConfirmType && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden animate-slide-up">
            
            <div className="p-6 border-b border-rose-50 flex items-center justify-between bg-rose-50/20">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-rose-900 text-sm sm:text-base">
                  {isRtl ? 'تأكيد الحذف النهائي' : 'Confirm Permanent Deletion'}
                </h3>
              </div>
              <button 
                onClick={() => {
                  if (!isDeleting) {
                    setDeleteConfirmType(null);
                    setDeleteConfirmId(null);
                    setDeleteConfirmName('');
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                className="bg-slate-50 hover:bg-slate-100 text-slate-400 p-2 rounded-lg transition-all border border-slate-150 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                {deleteConfirmType === 'product' ? (
                  isRtl ? (
                    <span>هل أنت متأكد تماماً من حذف هذا المنتج؟ <strong className="text-slate-800">« {deleteConfirmName} »</strong>. سيتم إزالته من المتجر نهائياً ولا يمكن التراجع عن هذا الإجراء.</span>
                  ) : (
                    <span>Are you sure you want to permanently delete the product <strong className="text-slate-800">"{deleteConfirmName}"</strong>? This will remove it from the market catalog.</span>
                   )
                ) : (
                  isRtl ? (
                    <span>هل أنت متأكد تماماً من حذف الطلب ذو الرقم التعريفى <strong className="text-slate-800 font-mono">« #{deleteConfirmName.slice(0, 8)} »</strong>؟ لن تتمكن من استعادته بعد الحذف.</span>
                  ) : (
                    <span>Are you sure you want to permanently delete order <strong className="text-slate-800 font-mono">"#{deleteConfirmName.slice(0, 8)}"</strong>? This action cannot be reversed.</span>
                  )
                )}
              </p>

              {deleteError && (
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                disabled={isDeleting}
                onClick={() => {
                  setDeleteConfirmType(null);
                  setDeleteConfirmId(null);
                  setDeleteConfirmName('');
                  setDeleteError(null);
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 hover:scale-102 active:scale-98"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              
              <button
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-650 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:bg-rose-300 hover:scale-102 active:scale-98 shadow-sm hover:shadow-md"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isRtl ? 'جاري الحذف...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'نعم، احذف نهائياً' : 'Yes, Delete'}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* BARCODE SCANNER OVERLAY FOR ADMIN POS SEARCH */}
      <BarcodeScannerModal
        isOpen={isAdminScannerOpen}
        onClose={() => setIsAdminScannerOpen(false)}
        onScanSuccess={(scannedBarcode) => {
          setSearchTerm(scannedBarcode);
        }}
        products={products}
        lang={lang}
      />

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
        onUpdateSettings={onUpdateSettings}
      />

    </div>
  );
}
