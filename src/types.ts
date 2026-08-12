export type Language = 'ar' | 'en';

export interface ProductReview {
  id: string;
  userName: string;
  rating: number; // 1 to 5
  comment: string;
  date: string;
}

export interface StoreSettings {
  storeNameAr: string;
  storeNameEn: string;
  ownerNameAr: string;
  ownerNameEn: string;
  ownerPhone: string;
  ownerEmail: string;
  logoUrl: string;
  currencyAr: string;
  currencyEn: string;
  promoMsgAr?: string;
  promoMsgEn?: string;
  bioAr?: string;
  bioEn?: string;
  adminPasscode?: string;
}

export interface Product {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  price: number; // Price per unit or price per 1kg if isWeighted is true
  discountPrice?: number;
  image: string;
  images?: string[];
  category: string;
  categoryAr: string;
  stock: number;
  reviews?: ProductReview[];
  barcode?: string;
  costPrice?: number;
  isWeighted?: boolean; // True if sold by weight (e.g. sweets/pastries per kg)
  unitType?: 'unit' | 'kg' | 'piece';
  recipeAr?: string;        // طريقة التحضير والوصفة المفصلة
  recipeEn?: string;        // Detailed recipe steps
  ingredientsAr?: string;   // المقادير والمكونات
  ingredientsEn?: string;   // Ingredients list
  preparationTime?: string; // e.g. "45 دقيقة"
  difficulty?: 'easy' | 'medium' | 'hard'; // مستوى الصعوبة
  showRecipeToCustomers?: boolean; // إظهار أو إخفاء الوصفة للزبائن في المتجر
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedWeightGrams?: number; // Weight in grams for weighted products (e.g. 500g = 0.5kg)
  customWeightText?: string;    // Formatted weight label e.g. "0.5 كغ (500 غ)"
  calculatedUnitPrice?: number; // Computed price for selected weight
}

export interface OrderItem {
  productId: string;
  titleAr: string;
  titleEn: string;
  price: number;
  quantity: number;
  costPrice?: number;
  selectedWeightGrams?: number;
  customWeightText?: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
  date: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
}

export interface TranslationDictionary {
  appName: string;
  dashboard: string;
  storefront: string;
  adminLogin: string;
  adminLogout: string;
  changeLanguage: string;
  searchPlaceholder: string;
  allCategories: string;
  categories: Record<string, string>;
  addToCart: string;
  outOfStock: string;
  inStock: string;
  stockLeft: string;
  cart: string;
  cartEmpty: string;
  total: string;
  checkout: string;
  checkoutTitle: string;
  fullName: string;
  phoneNumber: string;
  address: string;
  email: string;
  placeOrder: string;
  orderSuccess: string;
  orderNumber: string;
  downloadInvoice: string;
  close: string;
  adminPanel: string;
  dashboardStats: string;
  totalSales: string;
  ordersCount: string;
  productsCount: string;
  activeOrders: string;
  changePasswordTitle: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  saveChanges: string;
  passwordChangedSuccess: string;
  passwordMismatch: string;
  wrongPassword: string;
  adminLoginTitle: string;
  loginButton: string;
  enterPasswordPlaceholder: string;
  addProduct: string;
  editProduct: string;
  deleteProduct: string;
  productTitleAr: string;
  productTitleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceLabel: string;
  categoryLabel: string;
  stockLabel: string;
  imageUrl: string;
  saveProduct: string;
  cancel: string;
  ordersList: string;
  noOrders: string;
  customer: string;
  phone: string;
  date: string;
  statusLabel: string;
  statusOptions: {
    pending: string;
    shipped: string;
    delivered: string;
    cancelled: string;
  };
  downloadOrderData: string;
  currency: string;
  reviewsTitle: string;
  addReview: string;
  ratingLabel: string;
  commentLabel: string;
  noReviews: string;
  submitReview: string;
  yourName: string;
  selectRating: string;
  averageRating: string;
  storeSettingsTitle: string;
  storeNameLabelAr: string;
  storeNameLabelEn: string;
  ownerNameLabelAr: string;
  ownerNameLabelEn: string;
  ownerPhoneLabel: string;
  ownerEmailLabel: string;
  logoUrlLabel: string;
  saveSettingsSuccess: string;
  trackOrder: string;
  trackOrderTitle: string;
  trackOrderPlaceholder: string;
  trackOrderBt: string;
  orderNotFound: string;
  orderStatusTrack: string;
  currencyArLabel: string;
  currencyEnLabel: string;
  promoMsgArLabel: string;
  promoMsgEnLabel: string;
  bioArLabel: string;
  bioEnLabel: string;
  barcodeLabel: string;
  barcodePlaceholder: string;
  generateBarcode: string;
  scanBarcode: string;
  barcodeScanner: string;
  barcodeNotFound: string;
  searchByBarcode: string;
  searchBarcodePlaceholder: string;
  noProductFoundForBarcode: string;
  barcodeScanSuccess: string;
  simulateBarcodeScan: string;
  scannerCameraTip: string;
}

export interface StaffMember {
  id: string;
  nameAr: string;
  nameEn: string;
  username: string;
  passcode: string;
  createdAt: string;
  allowedTabs?: string[];
}
