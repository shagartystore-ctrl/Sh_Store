const API_BASE = 'https://shagarty-store-api.youssefzeweil1.workers.dev';
const FALLBACK_PRODUCTS = [
  { id: 1, name: 'شجرتي البكر الممتاز', description: '500 مل • عصر الموسم', price: 285, category: 'oil', tag: 'الأكثر مبيعًا' },
  { id: 2, name: 'شجرتي العائلي', description: '1 لتر • نكهة متوازنة', price: 420, category: 'oil', tag: 'اختيار العائلة' },
  { id: 3, name: 'صندوق الهدية', description: 'زجاجتان + عسل سيوي', price: 690, category: 'gift', tag: 'هدية مثالية' },
  { id: 4, name: 'شجرتي بيور', description: '750 مل • طعم فاكهي', price: 350, category: 'oil', tag: 'جديد' },
  { id: 5, name: 'مجموعة التذوق', description: '3 × 250 مل • نكهات مختلفة', price: 495, category: 'gift', tag: 'للمحبين' },
  { id: 6, name: 'عبوة الضيافة', description: '250 مل • للمائدة', price: 175, category: 'oil', tag: 'خفيف' }
];

let products = [];
let cart = [];
const WHATSAPP = '201014761698';
const grid = document.querySelector('#productsGrid');
const cartCount = document.querySelector('#cartCount');
const cartDrawer = document.querySelector('#cartDrawer');
const overlay = document.querySelector('#overlay');

function renderProducts(filter = 'all') {
  grid.innerHTML = products
    .filter((product) => filter === 'all' || product.category === filter)
    .map((product) => `<article class="product-card"><div class="product-image">${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy">` : '<div class="mini-bottle"></div>'}<span class="product-tag">${product.tag || ''}</span></div><div class="product-info"><div><h3>${product.name}</h3><p>${product.description || product.desc || ''}</p></div><strong class="price">${Number(product.price).toLocaleString('ar-EG')} ج.م</strong></div><button class="add-product" data-id="${product.id}">أضف للسلة +</button></article>`)
    .join('');
  document.querySelectorAll('.add-product').forEach((button) => button.addEventListener('click', () => addToCart(Number(button.dataset.id))));
}

function addToCart(id) {
  const item = cart.find((entry) => entry.id === id);
  if (item) item.qty += 1;
  else {
    const product = products.find((entry) => entry.id === id);
    if (product) cart.push({ ...product, qty: 1 });
  }
  renderCart();
  openCart();
}

function renderCart() {
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCount.textContent = count;
  document.querySelector('#cartTotal').textContent = `${total.toLocaleString('ar-EG')} ج.م`;
  document.querySelector('#cartItems').innerHTML = cart.length
    ? cart.map((item) => `<div class="cart-line"><div><h4>${item.name}</h4><small>${item.qty} × ${item.price} ج.م</small></div><button data-remove="${item.id}" aria-label="حذف ${item.name}">حذف</button></div>`).join('')
    : '<p class="empty-cart">السلة فاضية لسه.<br>اختار قطرتك المفضلة!</p>';
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    cart = cart.filter((item) => item.id !== Number(button.dataset.remove));
    renderCart();
  }));
}

function openCart() { cartDrawer.classList.add('open'); cartDrawer.setAttribute('aria-hidden', 'false'); overlay.classList.add('show'); }
function closeCart() { cartDrawer.classList.remove('open'); cartDrawer.setAttribute('aria-hidden', 'true'); overlay.classList.remove('show'); }

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

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.filter.active')?.classList.remove('active');
  button.classList.add('active');
  renderProducts(button.dataset.filter);
}));
document.querySelector('#openCart').addEventListener('click', openCart);
document.querySelector('#closeCart').addEventListener('click', closeCart);
overlay.addEventListener('click', closeCart);
document.querySelector('#checkout').addEventListener('click', () => {
  if (!cart.length) { alert('أضف منتجًا للسلة أولًا.'); return; }
  const lines = cart.map((item) => `- ${item.name} × ${item.qty}`).join('\n');
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const message = `مرحبًا شجرتي، أريد طلب:\n${lines}\nالإجمالي التقريبي: ${total} ج.م\nطريقة الدفع: فودافون كاش`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank');
});
document.querySelector('#newsletterForm').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#formMessage').textContent = 'تم الاشتراك بنجاح — أهلاً بك في عائلة شجرتي.';
  event.target.reset();
});

loadProducts();
