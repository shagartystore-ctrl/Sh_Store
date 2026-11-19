const API_BASE = 'https://shagarty-store-api.youssefzeweil1.workers.dev';
const SHIPPING_FEE = 80;
const WHATSAPP = '201014761698';
const FALLBACK_PRODUCTS = [{ id: 1, name: 'زيت زيتون اكسترا ممتاز', description: 'زيت زيتون اكسترا ممتاز • عبوة الموسم', price: 350, category: 'oil', tag: 'اكسترا ممتاز' }];
let products = [];
let cart = [];
const grid = document.querySelector('#productsGrid');
const cartCount = document.querySelector('#cartCount');
const cartDrawer = document.querySelector('#cartDrawer');
const overlay = document.querySelector('#overlay');
const checkoutForm = document.querySelector('#checkoutForm');
const receiptField = document.querySelector('#receiptField');
const checkoutMessage = document.querySelector('#checkoutMessage');

function renderProducts() {
  grid.innerHTML = products.map((product) => `<article class="product-card"><div class="product-image">${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy">` : '<div class="mini-bottle"></div>'}<span class="product-tag">${product.tag || ''}</span></div><div class="product-info"><div><h3>${product.name}</h3><p>${product.description || ''}</p></div><strong class="price">${Number(product.price).toLocaleString('ar-EG')} ج.م</strong></div><button class="add-product" data-id="${product.id}">أضف للسلة +</button></article>`).join('');
  document.querySelectorAll('.add-product').forEach((button) => button.addEventListener('click', () => addToCart(Number(button.dataset.id))));
}

function subtotal() { return cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0); }
function total() { return cart.length ? subtotal() + SHIPPING_FEE : 0; }

function addToCart(id) {
  const product = products.find((entry) => entry.id === id);
  if (!product) return;
  const item = cart.find((entry) => entry.id === id);
  if (item) item.qty += 1;
  else cart.push({ ...product, qty: 1 });
  renderCart();
  openCart();
}

function renderCart() {
  cartCount.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelector('#cartTotal').textContent = `${total().toLocaleString('ar-EG')} ج.م`;
  document.querySelector('#cartItems').innerHTML = cart.length
    ? `${cart.map((item) => `<div class="cart-line"><div><h4>${item.name}</h4><small>${item.qty} × ${item.price} ج.م</small></div><button data-remove="${item.id}" aria-label="حذف ${item.name}">حذف</button></div>`).join('')}<p class="payment-note">سعر المنتجات: ${subtotal()} ج.م<br>الشحن: ${SHIPPING_FEE} ج.م</p>`
    : '<p class="empty-cart">السلة فاضية لسه.<br>اختار زيتك المفضل!</p>';
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    cart = cart.filter((item) => item.id !== Number(button.dataset.remove));
    checkoutForm.hidden = true;
    renderCart();
  }));
}

function openCart() { cartDrawer.classList.add('open'); cartDrawer.setAttribute('aria-hidden', 'false'); overlay.classList.add('show'); }
function closeCart() { cartDrawer.classList.remove('open'); cartDrawer.setAttribute('aria-hidden', 'true'); overlay.classList.remove('show'); }

function syncPaymentUI() {
  const selected = document.querySelector('input[name="payment_method"]:checked')?.value || 'cod';
  receiptField.hidden = selected !== 'vodafone_cash';
  document.querySelectorAll('[data-payment-option]').forEach((option) => option.classList.toggle('selected', option.dataset.paymentOption === selected));
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_BASE}/api/products`);
    if (!response.ok) throw new Error('API unavailable');
    const data = await response.json();
    products = Array.isArray(data.products) && data.products.length ? data.products : FALLBACK_PRODUCTS;
  } catch {
    products = FALLBACK_PRODUCTS;
  }
  renderProducts();
  renderCart();
}

function readReceipt(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!file.type.startsWith('image/')) return reject(new Error('ارفع صورة فقط للوصل.'));
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      image.onerror = () => reject(new Error('تعذر قراءة صورة الوصل.'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
    reader.readAsDataURL(file);
  });
}

document.querySelector('#openCart').addEventListener('click', openCart);
document.querySelector('#closeCart').addEventListener('click', closeCart);
overlay.addEventListener('click', closeCart);
document.querySelector('#checkout').addEventListener('click', () => {
  if (!cart.length) { alert('أضف المنتج إلى السلة أولًا.'); return; }
  checkoutForm.hidden = !checkoutForm.hidden;
  checkoutMessage.textContent = '';
  if (!checkoutForm.hidden) {
    syncPaymentUI();
    checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
document.querySelectorAll('input[name="payment_method"]').forEach((radio) => radio.addEventListener('change', syncPaymentUI));
syncPaymentUI();
checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutMessage.textContent = 'جارِ إرسال الطلب…';
  const formData = new FormData(checkoutForm);
  const paymentMethod = formData.get('payment_method');
  const receiptFile = formData.get('receipt');
  try {
    const receiptData = paymentMethod === 'vodafone_cash' ? await readReceipt(receiptFile) : '';
    if (paymentMethod === 'vodafone_cash' && !receiptData) throw new Error('ارفع صورة وصل التحويل أولًا.');
    const response = await fetch(`${API_BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      customer_name: formData.get('customer_name'), phone: formData.get('phone'), address: formData.get('address'), notes: formData.get('notes'), payment_method: paymentMethod, receipt_data: receiptData,
      items: cart.map((item) => ({ product_id: item.id, quantity: item.qty }))
    }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'تعذر إرسال الطلب.');
    const paymentText = paymentMethod === 'cod' ? 'الدفع عند الاستلام' : 'تم التحويل عبر Vodafone Cash وإرفاق صورة الوصل';
    const message = `مرحبًا شجرتي، تم تسجيل طلبي رقم ${result.order_id}.\nالمنتج: زيت زيتون اكسترا ممتاز × ${cart.reduce((sum, item) => sum + item.qty, 0)}\nالإجمالي شامل الشحن: ${result.total} ج.م\nطريقة الدفع: ${paymentText}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank');
    checkoutMessage.textContent = `تم تسجيل الطلب رقم ${result.order_id} بنجاح.`;
    cart = [];
    checkoutForm.reset();
    receiptField.hidden = true;
    renderCart();
  } catch (error) {
    checkoutMessage.textContent = error.message;
  }
});

loadProducts();
