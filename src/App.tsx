import { useState, useEffect, useRef } from 'react';
import { Product, CartItem, Order, OrderItem, Language, StoreSettings, StaffMember } from './types';
import { initialProducts } from './data/initialProducts';
import { translations } from './data/translations';
import Storefront from './components/Storefront';
import AdminPanel from './components/AdminPanel';
import { sendOrderNotification } from './lib/notifications';

// Firebase Core Services
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  arrayUnion
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType, normalizePhone } from './lib/firebase';

export default function App() {
  // Application Modes: 'storefront' | 'admin'
  const [viewMode, setViewMode] = useState<'storefront' | 'admin'>('storefront');
  
  // Multi-language current state (Default to العربية 'ar' as requested in Arabic)
  const [lang, setLang] = useState<Language>('ar');

  // Master product list and order history
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Interactive customer cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Master staff list for partial administrative roles
  const [staff, setStaff] = useState<StaffMember[]>([]);

  // Firebase Authentication Current Logged-in User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Store customization settings (Name, Owner details, phone, email, and Logo)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    storeNameAr: "حلويات أنفال للتميز",
    storeNameEn: "Anfal Sweets",
    ownerNameAr: "إدارة حلويات أنفال",
    ownerNameEn: "Anfal Management",
    ownerPhone: "0783346645",
    ownerEmail: "support@example.com",
    logoUrl: "/logo.jpg",
    currencyAr: "د.ج",
    currencyEn: "DZD",
    promoMsgAr: "🍯 أهلاً بكم في حلويات أنفال للتميز! اطلب بالميزان (الكيلوغرام) أو بالعلبة مع توصيل سريع للبيت 📦",
    promoMsgEn: "🍯 Welcome to Anfal Sweets! Order by weight (kg/grams) or box with express home delivery 📦",
    bioAr: "مرحباً بكم في متجر حلويات أنفال للتميز المتخصص في أرقى وأشهى الحلويات الشرقية والجزائرية التقليدية. بقلاوة، قلب اللوز، مقروض الكوشة، دزيريات وحلويات المشكل بالميزان.",
    bioEn: "Welcome to Anfal Sweets for authentic traditional and oriental sweets & pastries. Order by weight or custom box."
  });

  // Check if current authenticated user has administrative email matches
  const isAdminUser = currentUser?.email === 'salahbousbia82@gmail.com';

  // 1. Load Preference Language & Auth state
  useEffect(() => {
    const savedLang = localStorage.getItem('store_language') as Language;
    if (savedLang) {
      setLang(savedLang);
    } else {
      localStorage.setItem('store_language', 'ar');
    }

    // Set up Auth state subscription
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Load and Sync Products from Firestore in real-time with local fallback
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((snapshotDoc) => {
        list.push(snapshotDoc.data() as Product);
      });
      // Save local products or merge with them
      const localSaved = localStorage.getItem('local_products');
      const localProducts = localSaved ? JSON.parse(localSaved) : [];
      
      // Clean up synced products from local storage so they don't block deletion across devices!
      const hasSyncedProducts = localProducts.some((lp: Product) => list.some(p => p.id === lp.id));
      let cleanLocalProducts = localProducts;
      if (hasSyncedProducts) {
        cleanLocalProducts = localProducts.filter((lp: Product) => !list.some(p => p.id === lp.id));
        localStorage.setItem('local_products', JSON.stringify(cleanLocalProducts));
      }

      const mergedList = [...list, ...cleanLocalProducts].map(p => {
        const initP = initialProducts.find(ip => ip.id === p.id);
        if (initP) {
          return {
            ...p,
            ingredientsAr: p.ingredientsAr || initP.ingredientsAr,
            ingredientsEn: p.ingredientsEn || initP.ingredientsEn,
            recipeAr: p.recipeAr || initP.recipeAr,
            recipeEn: p.recipeEn || initP.recipeEn,
            preparationTime: p.preparationTime || initP.preparationTime,
            difficulty: p.difficulty || initP.difficulty,
            showRecipeToCustomers: p.showRecipeToCustomers !== undefined ? p.showRecipeToCustomers : true
          };
        }
        return p;
      });
      setProducts(mergedList);
      setLoadingProducts(false);
    }, (error) => {
      console.warn("Products sync failed or unauthenticated, falling back to local database:", error);
      const localSaved = localStorage.getItem('local_products');
      if (localSaved) {
        const parsed: Product[] = JSON.parse(localSaved);
        const enriched = parsed.map(p => {
          const initP = initialProducts.find(ip => ip.id === p.id);
          if (initP) {
            return {
              ...p,
              ingredientsAr: p.ingredientsAr || initP.ingredientsAr,
              ingredientsEn: p.ingredientsEn || initP.ingredientsEn,
              recipeAr: p.recipeAr || initP.recipeAr,
              recipeEn: p.recipeEn || initP.recipeEn,
              preparationTime: p.preparationTime || initP.preparationTime,
              difficulty: p.difficulty || initP.difficulty,
              showRecipeToCustomers: p.showRecipeToCustomers !== undefined ? p.showRecipeToCustomers : true
            };
          }
          return p;
        });
        setProducts(enriched);
      } else {
        setProducts(initialProducts);
      }
      setLoadingProducts(false);
    });

    return () => unsubProducts();
  }, []);

  // 3. Load and Sync Settings from Firestore in real-time with local fallback
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'storeSettings'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as StoreSettings;
        const rawStoreName = data.storeNameAr || "";
        const isOldNidhal = rawStoreName.includes("النضال") || rawStoreName.includes("نضال") || !data.storeNameAr;
        const currentLogo = (!data.logoUrl || data.logoUrl.includes('unsplash.com')) ? "/logo.jpg" : data.logoUrl;

        const mappedSettings: StoreSettings = {
          storeNameAr: isOldNidhal ? "حلويات أنفال للتميز" : data.storeNameAr,
          storeNameEn: isOldNidhal ? "Anfal Sweets" : (data.storeNameEn || "Anfal Sweets"),
          ownerNameAr: (data.ownerNameAr && !data.ownerNameAr.includes("نضال")) ? data.ownerNameAr : "إدارة حلويات أنفال",
          ownerNameEn: (data.ownerNameEn && !data.ownerNameEn.includes("Nidhal")) ? data.ownerNameEn : "Anfal Management",
          ownerPhone: data.ownerPhone || "0783346645",
          ownerEmail: data.ownerEmail || "support@example.com",
          logoUrl: currentLogo,
          currencyAr: data.currencyAr || "د.ج",
          currencyEn: data.currencyEn || "DZD",
          promoMsgAr: (data.promoMsgAr && !data.promoMsgAr.includes("النضال")) ? data.promoMsgAr : "🍯 أهلاً بكم في حلويات أنفال للتميز! اطلب بالميزان (الكيلوغرام) أو بالعلبة مع توصيل سريع للبيت 📦",
          promoMsgEn: (data.promoMsgEn && !data.promoMsgEn.includes("Nidhal")) ? data.promoMsgEn : "🍯 Welcome to Anfal Sweets! Order by weight (kg/grams) or box with express home delivery 📦",
          bioAr: (data.bioAr && !data.bioAr.includes("النضال")) ? data.bioAr : "مرحباً بكم في متجر حلويات أنفال للتميز المتخصص في أرقى وأشهى الحلويات الشرقية والجزائرية التقليدية. بقلاوة، قلب اللوز، مقروض الكوشة، دزيريات وحلويات المشكل بالميزان.",
          bioEn: (data.bioEn && !data.bioEn.includes("Nidhal")) ? data.bioEn : "Welcome to Anfal Sweets for authentic traditional and oriental sweets & pastries. Order by weight or custom box.",
          adminPasscode: data.adminPasscode || "admin"
        };
        setStoreSettings(mappedSettings);
        
        // Synchronize admin_password with local storage so that other client state keeps in line
        if (data.adminPasscode) {
          localStorage.setItem('admin_password', data.adminPasscode);
        }
      } else {
        const localSaved = localStorage.getItem('local_settings');
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          if (parsed.storeNameAr?.includes("النضال") || parsed.storeNameAr?.includes("نضال")) {
            parsed.storeNameAr = "حلويات أنفال للتميز";
            parsed.storeNameEn = "Anfal Sweets";
            parsed.ownerNameAr = "إدارة حلويات أنفال";
            parsed.ownerNameEn = "Anfal Management";
            parsed.promoMsgAr = "🍯 أهلاً بكم في حلويات أنفال للتميز! اطلب بالميزان (الكيلوغرام) أو بالعلبة مع توصيل سريع للبيت 📦";
            parsed.bioAr = "مرحباً بكم في متجر حلويات أنفال للتميز المتخصص في أرقى وأشهى الحلويات الشرقية والجزائرية التقليدية.";
          }
          if (!parsed.logoUrl || parsed.logoUrl.includes('unsplash.com')) {
            parsed.logoUrl = "/logo.jpg";
          }
          setStoreSettings(parsed);
        } else {
          // Seed default settings config
          const defaultSettingsData: StoreSettings = {
            storeNameAr: "حلويات أنفال للتميز",
            storeNameEn: "Anfal Sweets",
            ownerNameAr: "إدارة حلويات أنفال",
            ownerNameEn: "Anfal Management",
            ownerPhone: "0783346645",
            ownerEmail: "support@example.com",
            logoUrl: "/logo.jpg",
            currencyAr: "د.ج",
            currencyEn: "DZD",
            promoMsgAr: "🍯 أهلاً بكم في حلويات أنفال للتميز! اطلب بالميزان (الكيلوغرام) أو بالعلبة مع توصيل سريع للبيت 📦",
            promoMsgEn: "🍯 Welcome to Anfal Sweets! Order by weight (kg/grams) or box with express home delivery 📦",
            bioAr: "مرحباً بكم في متجر حلويات أنفال للتميز المتخصص في أرقى وأشهى الحلويات الشرقية والجزائرية التقليدية.",
            bioEn: "Welcome to Anfal Sweets for authentic traditional and oriental sweets & pastries.",
            adminPasscode: "admin"
          };
          if (isAdminUser) {
            setDoc(doc(db, 'settings', 'storeSettings'), defaultSettingsData)
              .then(() => setStoreSettings(defaultSettingsData))
              .catch(err => console.error("Error seeding config defaults:", err));
          } else {
            setStoreSettings(defaultSettingsData);
          }
        }
      }
    }, (error) => {
      console.warn("Settings sync failed or unauthenticated, falling back to local settings:", error);
      const localSaved = localStorage.getItem('local_settings');
      if (localSaved) {
        setStoreSettings(JSON.parse(localSaved));
      }
    });

    return () => unsubSettings();
  }, [isAdminUser]);

  // Sync Staff from Firestore in real-time with local fallback
  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      const list: StaffMember[] = [];
      snapshot.forEach((snapDoc) => {
        list.push(snapDoc.data() as StaffMember);
      });
      // Merge with local storage fallback staff
      const localSaved = localStorage.getItem('local_staff');
      const localStaff = localSaved ? JSON.parse(localSaved) : [];
      const mergedList = [...list, ...localStaff.filter((ls: StaffMember) => !list.some(s => s.id === ls.id))];
      setStaff(mergedList);
    }, (error) => {
      console.warn("Staff sync failed or unauthenticated, falling back to local roster:", error);
      const localSaved = localStorage.getItem('local_staff');
      if (localSaved) {
        setStaff(JSON.parse(localSaved));
      }
    });

    return () => unsubStaff();
  }, []);

  // STAFF ACTIONS FOR ADMIN
  const handleAddStaff = async (newStaff: StaffMember) => {
    // Optimistic local state update
    setStaff(prev => {
      const exists = prev.some(s => s.id === newStaff.id);
      if (exists) {
        return prev.map(s => s.id === newStaff.id ? newStaff : s);
      }
      return [newStaff, ...prev];
    });
    
    const localSaved = localStorage.getItem('local_staff');
    const localStaff = localSaved ? JSON.parse(localSaved) : [];
    const existsInLocal = localStaff.some((s: StaffMember) => s.id === newStaff.id);
    const updatedLocal = existsInLocal
      ? localStaff.map((s: StaffMember) => s.id === newStaff.id ? newStaff : s)
      : [newStaff, ...localStaff];
    localStorage.setItem('local_staff', JSON.stringify(updatedLocal));

    try {
      await setDoc(doc(db, 'staff', newStaff.id), newStaff);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staff/${newStaff.id}`);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    // Optimistic local state update
    setStaff(prev => prev.filter(s => s.id !== staffId));
    const localSaved = localStorage.getItem('local_staff');
    const localStaff = localSaved ? JSON.parse(localSaved) : [];
    localStorage.setItem('local_staff', JSON.stringify(localStaff.filter((s: StaffMember) => s.id !== staffId)));

    try {
      await deleteDoc(doc(db, 'staff', staffId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staff/${staffId}`);
    }
  };

  // 4. Secure real-time stream for orders history (ADMIN & STAFF) with local fallback
  const isFirstLoadOrdersRef = useRef(true);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('date', 'desc'));
    const unsubOrders = onSnapshot(q, (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as Order);
      });

      // Detect and notify on brand new orders added to Firestore
      if (!isFirstLoadOrdersRef.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newOrder = change.doc.data() as Order;
            // Send mobile/browser notification
            sendOrderNotification(
              newOrder, 
              lang === 'ar' ? storeSettings.currencyAr : storeSettings.currencyEn
            );
          }
        });
      } else {
        isFirstLoadOrdersRef.current = false;
      }

      // Merge local storage fallback orders
      const saved = localStorage.getItem('local_orders') || '[]';
      const localList = JSON.parse(saved);
      
      // Clean up synced orders from local storage so they don't block deletion across devices!
      const hasSyncedOrders = localList.some((lo: Order) => list.some(o => o.id === lo.id));
      let cleanLocalList = localList;
      if (hasSyncedOrders) {
        cleanLocalList = localList.filter((lo: Order) => !list.some(o => o.id === lo.id));
        localStorage.setItem('local_orders', JSON.stringify(cleanLocalList));
      }

      const mergedList = [...list, ...cleanLocalList];
      setOrders(mergedList);
    }, (error) => {
      console.warn("Orders live list failed or unauthenticated, falling back to local:", error);
      const saved = localStorage.getItem('local_orders');
      setOrders(saved ? JSON.parse(saved) : []);
    });

    return () => unsubOrders();
  }, [storeSettings.currencyAr, storeSettings.currencyEn, lang]);

  // 5. Retroactively build phone_orders indexes for older orders
  useEffect(() => {
    if (isAdminUser && orders.length > 0) {
      const syncPhoneIndices = async () => {
        try {
          for (const order of orders) {
            if (order.customerPhone) {
              const cleanPhone = normalizePhone(order.customerPhone);
              if (cleanPhone) {
                const phoneDocRef = doc(db, 'phone_orders', cleanPhone);
                const phoneDocSnap = await getDoc(phoneDocRef);
                
                let needsUpdate = false;
                if (!phoneDocSnap.exists()) {
                  needsUpdate = true;
                } else {
                  const existingIds = phoneDocSnap.data()?.orderIds || [];
                  if (!existingIds.includes(order.id)) {
                    needsUpdate = true;
                  }
                }

                if (needsUpdate) {
                  await setDoc(phoneDocRef, {
                    orderIds: arrayUnion(order.id)
                  }, { merge: true });
                  console.log(`Auto-healing: Registered order ${order.id} under phone ${cleanPhone}`);
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to automatically index phone registries", e);
        }
      };
      
      const timer = setTimeout(() => {
        syncPhoneIndices();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isAdminUser, orders]);

  // 6. Automatically sync local staff to live Firebase Firestore once Google Admin logs in
  useEffect(() => {
    if (isAdminUser) {
      const syncLocalStaffToFirestore = async () => {
        try {
          const localSaved = localStorage.getItem('local_staff');
          if (!localSaved) return;
          const localStaff: StaffMember[] = JSON.parse(localSaved);
          
          for (const s of localStaff) {
            const staffDocRef = doc(db, 'staff', s.id);
            const staffSnap = await getDoc(staffDocRef);
            
            if (!staffSnap.exists()) {
              await setDoc(staffDocRef, s);
              console.log(`Auto-sync: Successfully persisted local staff member (${s.nameAr || s.nameEn}) to Firebase Firestore.`);
            }
          }
        } catch (e) {
          console.error("Auto-sync of local staff to Firestore failed:", e);
        }
      };

      const timer = setTimeout(() => {
        syncLocalStaffToFirestore();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAdminUser]);

  // Dynamic login helpers via Firebase Auth
  const handleLoginGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Popup authenticated trigger failed:", e);
      alert(lang === 'ar' ? 'فشل التحقق وتسجيل الدخول عبر جوجل' : 'Google Authentication popup failed');
    }
  };

  const handleLogoutGoogle = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.log("Logout execution error:", e);
    }
  };

  // Add Product Review to Firestore
  const handleAddReview = async (productId: string, userName: string, rating: number, comment: string) => {
    const newReview = {
      id: `rev-${Date.now()}`,
      userName: userName.trim() || (lang === 'ar' ? 'زبون مجهول' : 'Anonymous Guest'),
      rating: Number(rating) || 5,
      comment: comment.trim() || '',
      date: new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')
    };

    const targetProduct = products.find((p) => p.id === productId);
    if (!targetProduct) return;

    const updatedReviewsList = [newReview, ...(targetProduct.reviews || [])];

    try {
      await updateDoc(doc(db, 'products', productId), {
        reviews: updatedReviewsList
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
    }
  };

  // Toggle App Language
  const handleToggleLanguage = () => {
    const nextLang: Language = lang === 'ar' ? 'en' : 'ar';
    setLang(nextLang);
    localStorage.setItem('store_language', nextLang);
  };

  // PRODUCT ACTIONS (FOR ADMIN WORKFLOW)
  const handleAddProduct = async (newProdData: Omit<Product, 'id'>) => {
    const newId = `prod-${Date.now()}`;
    const newProduct: Product = {
      ...newProdData,
      id: newId
    };

    // Optimistic local state update
    setProducts((prev) => [newProduct, ...prev]);
    const localSaved = localStorage.getItem('local_products');
    const localProducts = localSaved ? JSON.parse(localSaved) : [];
    localStorage.setItem('local_products', JSON.stringify([newProduct, ...localProducts]));

    try {
      await setDoc(doc(db, 'products', newId), newProduct);
    } catch (err) {
      console.warn("Firestore product write skipped/failed, keeping in local storage:", err);
    }
  };

  const handleEditProduct = async (id: string, updatedFields: Partial<Product>) => {
    // Optimistic local state update
    setProducts((prevProducts) =>
      prevProducts.map((p) => (p.id === id ? { ...p, ...updatedFields } : p))
    );
    // Sync with cart
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product.id === id) {
          return {
            ...item,
            product: { ...item.product, ...updatedFields }
          };
        }
        return item;
      })
    );

    // Sync with localStorage
    const localSaved = localStorage.getItem('local_products');
    const localProducts = localSaved ? JSON.parse(localSaved) : [];
    const isLocalExist = localProducts.some((p: Product) => p.id === id);
    if (isLocalExist) {
      localStorage.setItem(
        'local_products',
        JSON.stringify(localProducts.map((p: Product) => (p.id === id ? { ...p, ...updatedFields } : p)))
      );
    } else {
      const serverProduct = products.find(p => p.id === id);
      if (serverProduct) {
        localStorage.setItem(
          'local_products',
          JSON.stringify([{ ...serverProduct, ...updatedFields }, ...localProducts])
        );
      }
    }

    try {
      await updateDoc(doc(db, 'products', id), updatedFields);
    } catch (err) {
      console.warn("Firestore product edit skipped/failed, keeping in local storage:", err);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    // Optimistic local state update
    setProducts((prevProducts) => prevProducts.filter((p) => p.id !== id));
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== id));

    // localStorage sync
    const localSaved = localStorage.getItem('local_products');
    const localProducts = localSaved ? JSON.parse(localSaved) : [];
    localStorage.setItem('local_products', JSON.stringify(localProducts.filter((p: Product) => p.id !== id)));

    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (err) {
      console.warn("Firestore product delete skipped/failed:", err);
    }
  };

  // Seed default template products manually
  const handleSeedDefaultProducts = async () => {
    try {
      for (const p of initialProducts) {
        await setDoc(doc(db, 'products', p.id), p);
      }
    } catch (err) {
      console.warn("Products seed skipped/failed:", err);
      // Mock seed locally
      localStorage.setItem('local_products', JSON.stringify(initialProducts));
      setProducts(initialProducts);
    }
  };

  // ORDER ACTIONS & STATUS MODIFIER FOR ADMIN
  const handleUpdateOrderStatus = async (orderId: string, status: Order['status']) => {
    // Optimistic local state update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));

    // Sync with localStorage
    const saved = localStorage.getItem('local_orders') || '[]';
    const localList = JSON.parse(saved);
    localStorage.setItem(
      'local_orders',
      JSON.stringify(localList.map((o: Order) => (o.id === orderId ? { ...o, status } : o)))
    );

    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (err) {
      console.warn("Firestore order update failed/skipped, keeping in local storage:", err);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    // Optimistic local state update
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    // Sync with localStorage
    const saved = localStorage.getItem('local_orders') || '[]';
    const localList = JSON.parse(saved);
    localStorage.setItem(
      'local_orders',
      JSON.stringify(localList.filter((o: Order) => o.id !== orderId))
    );

    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (err) {
      console.warn("Firestore order deletion skipped/failed:", err);
    }
  };

  // STORE SETTINGS UPDATE (ADMIN ONLY)
  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    // Optimistic local state update
    setStoreSettings(newSettings);
    // Sync with localStorage
    localStorage.setItem('local_settings', JSON.stringify(newSettings));

    try {
      await setDoc(doc(db, 'settings', 'storeSettings'), newSettings);
    } catch (err) {
      console.warn("Firestore settings update skipped/failed, keeping in local storage:", err);
    }
  };

  // CART WORKFLOW ACTIONS
  const handleAddToCart = (product: Product, selectedWeightGrams?: number, customWeightText?: string) => {
    // Determine if product is weighted (category sweets or flagged as weighted)
    const isWeighted = product.isWeighted || product.category === 'sweets' || product.unitType === 'kg';
    const weightGrams = isWeighted ? (selectedWeightGrams || 1000) : undefined;
    
    // Base unit price per 1 unit or per 1kg
    const basePrice = (product.discountPrice !== undefined && product.discountPrice > 0 && product.discountPrice < product.price) 
      ? product.discountPrice 
      : product.price;
      
    const computedUnitPrice = weightGrams 
      ? Math.round((basePrice * weightGrams) / 1000) 
      : basePrice;

    const formattedWeightText = customWeightText || (weightGrams ? (weightGrams >= 1000 ? `${weightGrams / 1000} كغ (${weightGrams} غ)` : `${weightGrams} غ`) : undefined);

    const existingIndex = cart.findIndex((item) => 
      item.product.id === product.id && item.selectedWeightGrams === weightGrams
    );

    if (existingIndex > -1) {
      setCart(
        cart.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          selectedWeightGrams: weightGrams,
          customWeightText: formattedWeightText,
          calculatedUnitPrice: computedUnitPrice
        }
      ]);
    }
  };

  const handleUpdateCartQty = (productId: string, quantity: number, selectedWeightGrams?: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId, selectedWeightGrams);
      return;
    }

    const itemObj = cart.find((item) => item.product.id === productId && item.selectedWeightGrams === selectedWeightGrams);
    if (!itemObj) return;

    // Validate against catalog stock
    const catalogItem = products.find((p) => p.id === productId);
    const stockLimit = catalogItem ? catalogItem.stock : itemObj.product.stock;

    if (quantity > stockLimit) {
      alert(lang === 'ar' ? 'عذراً، هذه الكمية غير متوفرة في المخزن.' : 'Sorry, this quantity is not available in stock.');
      return;
    }

    setCart(
      cart.map((item) =>
        (item.product.id === productId && item.selectedWeightGrams === selectedWeightGrams) 
          ? { ...item, quantity } 
          : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string, selectedWeightGrams?: number) => {
    setCart(cart.filter((item) => !(item.product.id === productId && item.selectedWeightGrams === selectedWeightGrams)));
  };

  // Place finished order and decrement stock
  const handlePlaceOrder = async (customerDetails: {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerEmail: string;
  }): Promise<Order | null> => {
    if (cart.length === 0) return null;

    // 1. Calculate order total and formulate items array
    const totalAmount = cart.reduce((sum, item) => {
      const p = item.product;
      const basePrice = (p.discountPrice !== undefined && p.discountPrice > 0 && p.discountPrice < p.price) ? p.discountPrice : p.price;
      const itemUnitPrice = item.selectedWeightGrams 
        ? Math.round((basePrice * item.selectedWeightGrams) / 1000)
        : (item.calculatedUnitPrice || basePrice);
      return sum + itemUnitPrice * item.quantity;
    }, 0);

    const orderItems: OrderItem[] = cart.map((item) => {
      const p = item.product;
      const basePrice = (p.discountPrice !== undefined && p.discountPrice > 0 && p.discountPrice < p.price) ? p.discountPrice : p.price;
      const itemUnitPrice = item.selectedWeightGrams 
        ? Math.round((basePrice * item.selectedWeightGrams) / 1000)
        : (item.calculatedUnitPrice || basePrice);
      return {
        productId: p.id,
        titleAr: item.customWeightText ? `${p.titleAr} [${item.customWeightText}]` : p.titleAr,
        titleEn: item.customWeightText ? `${p.titleEn} [${item.customWeightText}]` : p.titleEn,
        price: itemUnitPrice,
        quantity: item.quantity,
        costPrice: p.costPrice || 0,
        selectedWeightGrams: item.selectedWeightGrams,
        customWeightText: item.customWeightText
      };
    });

    // 2. Create order document entry
    const orderId = `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newOrder: Order = {
      id: orderId,
      ...customerDetails,
      items: orderItems,
      total: totalAmount,
      date: new Date().toISOString(),
      status: 'pending'
    };

    // Save to localStorage so that any offline or passcode/staff-based workspace testing can list it immediately
    const saved = localStorage.getItem('local_orders') || '[]';
    const localList = JSON.parse(saved);
    localStorage.setItem('local_orders', JSON.stringify([newOrder, ...localList]));
    // Optimistically update orders in-memory state
    setOrders((prev) => [newOrder, ...prev]);

    try {
      // Save order to Firestore
      await setDoc(doc(db, 'orders', orderId), newOrder);

      // Save a relational phone-to-order-ID mapping for extremely secure anonymous order tracking without collection listing
      if (customerDetails.customerPhone) {
        const cleanPhone = normalizePhone(customerDetails.customerPhone);
        if (cleanPhone) {
          await setDoc(doc(db, 'phone_orders', cleanPhone), {
            orderIds: arrayUnion(orderId)
          }, { merge: true });
        }
      }

      // Decrement stock for purchase goods
      for (const item of cart) {
        const catItem = products.find((p) => p.id === item.product.id);
        if (catItem) {
          const newStockValue = Math.max(0, catItem.stock - item.quantity);
          try {
            await updateDoc(doc(db, 'products', item.product.id), {
              stock: newStockValue
            });
          } catch (e) {
            console.warn(`Could not update stock for product ${item.product.id}:`, e);
          }
        }
      }

      setCart([]);
      return newOrder;
    } catch (err) {
      console.warn("Firestore order submission failed, using local offline fallback:", err);
      setCart([]);
      return newOrder;
    }
  };

  const currentDict = translations[lang];


  return (
    <>
      {viewMode === 'storefront' ? (
        <Storefront
          products={products}
          isLoadingProducts={loadingProducts}
          orders={orders}
          cart={cart}
          lang={lang}
          dict={currentDict}
          settings={storeSettings}
          onAddToCart={handleAddToCart}
          onUpdateCartQty={handleUpdateCartQty}
          onRemoveFromCart={handleRemoveFromCart}
          onPlaceOrder={handlePlaceOrder}
          onToggleLanguage={handleToggleLanguage}
          onAddReview={handleAddReview}
          onGoToAdmin={() => setViewMode('admin')}
        />
      ) : (
        <AdminPanel
          products={products}
          orders={orders}
          staff={staff}
          onAddStaff={handleAddStaff}
          onDeleteStaff={handleDeleteStaff}
          onAddProduct={handleAddProduct}
          onEditProduct={handleEditProduct}
          onDeleteProduct={handleDeleteProduct}
          onSeedDefaultProducts={handleSeedDefaultProducts}
          onDeleteOrder={handleDeleteOrder}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          settings={storeSettings}
          onUpdateSettings={handleUpdateSettings}
          lang={lang}
          dict={currentDict}
          onClose={() => setViewMode('storefront')}
          currentUser={currentUser}
          onLoginGoogle={handleLoginGoogle}
          onLogoutGoogle={handleLogoutGoogle}
        />
      )}
    </>
  );
}
