const SHIPPING_FEE = 80;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token,Authorization' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const isAdmin = (request, env) => { const token = request.headers.get('X-Admin-Token'); return Boolean(token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN); };
const productPayload = (body) => ({
  name: clean(body.name, 120), description: clean(body.description, 240), price: Math.max(0, Number(body.price || 0)),
  compare_at_price: Math.max(0, Number(body.compare_at_price || 0)), category: body.category === 'gift' ? 'gift' : 'oil',
  tag: clean(body.tag, 60), image_url: clean(body.image_url, 1800000), media_type: body.media_type === 'video' ? 'video' : 'image',
  active: body.active === false ? 0 : 1, sort_order: Number(body.sort_order || 0)
});
const productView = (product) => ({ ...product, discount_percentage: product.compare_at_price > product.price ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0 });
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}
async function currentUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  return (await env.DB.prepare('SELECT users.id,users.name,users.email,users.phone FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires_at>CURRENT_TIMESTAMP').bind(token).first()) || null;
}
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (path === '/health') return json({ ok: true, service: 'shagarty-store-api' });
      if (path === '/api/auth/register' && request.method === 'POST') {
        const body = await request.json(); const name = clean(body.name, 120); const email = clean(body.email, 160).toLowerCase(); const phone = clean(body.phone, 30); const password = String(body.password || '');
        if (!name || !email.includes('@') || password.length < 6) return json({ error: 'اكتب الاسم والبريد وكلمة مرور 6 أحرف على الأقل' }, 400);
        const salt = randomToken(); const passwordHash = await hashPassword(password, salt);
        try { const result = await env.DB.prepare('INSERT INTO users (name,email,phone,password_hash,password_salt) VALUES (?,?,?,?,?)').bind(name, email, phone, passwordHash, salt).run(); const token = randomToken(); await env.DB.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))").bind(token, result.meta.last_row_id).run(); return json({ token, user: { name, email, phone, id: result.meta.last_row_id } }, 201); } catch { return json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, 409); }
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json(); const email = clean(body.email, 160).toLowerCase(); const user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
        if (!user || !(await hashPassword(String(body.password || ''), user.password_salt) === user.password_hash)) return json({ error: 'البريد أو كلمة المرور غير صحيحة' }, 401);
        const token = randomToken(); await env.DB.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))").bind(token, user.id).run(); return json({ token, user: publicUser(user) });
      }
      if (path === '/api/me' && request.method === 'GET') { const user = await currentUser(request, env); return user ? json({ user: publicUser(user) }) : json({ error: 'غير مسجل الدخول' }, 401); }
      if (path === '/api/products' && request.method === 'GET') { const { results } = await env.DB.prepare('SELECT * FROM products WHERE active=1 ORDER BY sort_order,id').all(); return json({ products: results.map(productView) }); }
      if (path.startsWith('/api/products/') && path.endsWith('/reviews') && request.method === 'GET') {
        const productId = Number(path.split('/')[3]); const { results } = await env.DB.prepare('SELECT reviews.id,reviews.rating,reviews.comment,reviews.image_url,reviews.created_at,users.name FROM reviews JOIN users ON users.id=reviews.user_id WHERE reviews.product_id=? AND reviews.approved=1 ORDER BY reviews.created_at DESC').bind(productId).all(); return json({ reviews: results });
      }
      if (path === '/api/reviews' && request.method === 'POST') {
        const user = await currentUser(request, env); if (!user) return json({ error: 'سجل الدخول أولًا لإضافة تقييم' }, 401); const body = await request.json(); const rating = Math.max(1, Math.min(5, Number(body.rating || 0))); const productId = Number(body.product_id); if (!productId || !rating) return json({ error: 'اختر تقييمًا صحيحًا' }, 400); await env.DB.prepare('INSERT INTO reviews (product_id,user_id,rating,comment,image_url) VALUES (?,?,?,?,?)').bind(productId, user.id, rating, clean(body.comment, 500), clean(body.image_url, 1000)).run(); return json({ ok: true }, 201);
      }
      if (path === '/api/orders' && request.method === 'POST') {
        const body = await request.json(); const customer = clean(body.customer_name, 120); const phone = clean(body.phone, 30); const address = clean(body.address, 300); const paymentMethod = body.payment_method === 'vodafone_cash' ? 'vodafone_cash' : 'cod'; const receiptData = clean(body.receipt_data, 950000); const items = Array.isArray(body.items) ? body.items : [];
        if (!customer || !phone || !address || !items.length) return json({ error: 'بيانات الطلب ناقصة' }, 400); if (paymentMethod === 'vodafone_cash' && !receiptData.startsWith('data:image/')) return json({ error: 'صورة وصل التحويل مطلوبة' }, 400); if (paymentMethod === 'cod' && receiptData) return json({ error: 'لا ترسل إيصالًا مع الدفع عند الاستلام' }, 400);
        const ids = items.map((item) => Number(item.product_id)).filter(Boolean); if (!ids.length) return json({ error: 'المنتجات غير متاحة' }, 400); const placeholders = ids.map(() => '?').join(','); const products = (await env.DB.prepare(`SELECT id,name,price FROM products WHERE active=1 AND id IN (${placeholders})`).bind(...ids).all()).results; const byId = new Map(products.map((product) => [product.id, product])); let subtotal = 0; const normalized = [];
        for (const item of items) { const product = byId.get(Number(item.product_id)); const quantity = Math.max(1, Math.min(99, Number(item.quantity || 1))); if (!product) continue; subtotal += product.price * quantity; normalized.push({ ...product, quantity }); }
        if (!normalized.length) return json({ error: 'المنتجات غير متاحة' }, 400); const total = subtotal + SHIPPING_FEE; const order = await env.DB.prepare('INSERT INTO orders (customer_name,phone,address,notes,payment_method,shipping_fee,receipt_data,total) VALUES (?,?,?,?,?,?,?,?)').bind(customer, phone, address, clean(body.notes, 500), paymentMethod, SHIPPING_FEE, receiptData, total).run(); await env.DB.batch(normalized.map((product) => env.DB.prepare('INSERT INTO order_items (order_id,product_id,product_name,unit_price,quantity) VALUES (?,?,?,?,?)').bind(order.meta.last_row_id, product.id, product.name, product.price, product.quantity))); return json({ ok: true, order_id: order.meta.last_row_id, subtotal, shipping_fee: SHIPPING_FEE, total, status: 'new', whatsapp: '201014761698' }, 201);
      }
      if (path.startsWith('/api/orders/') && request.method === 'GET') { const id = Number(path.split('/')[3]); const phone = clean(url.searchParams.get('phone'), 30); const order = await env.DB.prepare('SELECT id,status,total,shipping_fee,created_at FROM orders WHERE id=? AND phone=?').bind(id, phone).first(); return order ? json({ order }) : json({ error: 'الطلب غير موجود' }, 404); }
      if (path.startsWith('/api/admin/')) {
        if (!isAdmin(request, env)) return json({ error: 'غير مصرح' }, 401);
        if (path === '/api/admin/products' && request.method === 'GET') { const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY sort_order,id').all(); return json({ products: results.map(productView) }); }
        if (path === '/api/admin/products' && request.method === 'POST') { const product = productPayload(await request.json()); const result = await env.DB.prepare('INSERT INTO products (name,description,price,compare_at_price,category,tag,image_url,media_type,active,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(product.name, product.description, product.price, product.compare_at_price, product.category, product.tag, product.image_url, product.media_type, product.active, product.sort_order).run(); return json({ ok: true, id: result.meta.last_row_id }, 201); }
        const productId = Number(path.split('/').pop());
        if (path.startsWith('/api/admin/products/') && request.method === 'PATCH') { const product = productPayload(await request.json()); await env.DB.prepare('UPDATE products SET name=?,description=?,price=?,compare_at_price=?,category=?,tag=?,image_url=?,media_type=?,active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(product.name, product.description, product.price, product.compare_at_price, product.category, product.tag, product.image_url, product.media_type, product.active, product.sort_order, productId).run(); return json({ ok: true }); }
        if (path.startsWith('/api/admin/products/') && request.method === 'DELETE') { await env.DB.prepare('UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(productId).run(); return json({ ok: true }); }
        if (path === '/api/admin/orders' && request.method === 'GET') { const { results } = await env.DB.prepare('SELECT id,customer_name,phone,address,notes,payment_method,shipping_fee,receipt_data,status,total,created_at FROM orders ORDER BY created_at DESC').all(); return json({ orders: results }); }
        if (path.startsWith('/api/admin/orders/') && request.method === 'PATCH') { const status = clean((await request.json()).status, 30); await env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, Number(path.split('/').pop())).run(); return json({ ok: true }); }
        if (path === '/api/admin/reviews' && request.method === 'GET') { const { results } = await env.DB.prepare('SELECT reviews.*,users.name,products.name AS product_name FROM reviews JOIN users ON users.id=reviews.user_id JOIN products ON products.id=reviews.product_id ORDER BY reviews.created_at DESC').all(); return json({ reviews: results }); }
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: 'حدث خطأ في الخادم', detail: error.message }, 500); }
  }
};
