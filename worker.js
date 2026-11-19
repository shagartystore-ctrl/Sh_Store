const SHIPPING_FEE = 80;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const isAdmin = (request, env) => {
  const token = request.headers.get('X-Admin-Token');
  return Boolean(token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN);
};
const productPayload = (body) => ({
  name: clean(body.name, 120), description: clean(body.description, 240), price: Math.max(0, Number(body.price || 0)),
  category: body.category === 'gift' ? 'gift' : 'oil', tag: clean(body.tag, 60), image_url: clean(body.image_url, 1800000),
  media_type: body.media_type === 'video' ? 'video' : 'image',
  active: body.active === false ? 0 : 1, sort_order: Number(body.sort_order || 0)
});

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;
    try {
      if (path === '/health') return json({ ok: true, service: 'shagarty-store-api' });
      if (path === '/api/products' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order, id').all();
        return json({ products: results });
      }
      if (path === '/api/orders' && request.method === 'POST') {
        const body = await request.json();
        const customer = clean(body.customer_name, 120);
        const phone = clean(body.phone, 30);
        const address = clean(body.address, 300);
        const paymentMethod = body.payment_method === 'vodafone_cash' ? 'vodafone_cash' : 'cod';
        const receiptData = clean(body.receipt_data, 950000);
        const items = Array.isArray(body.items) ? body.items : [];
        if (!customer || !phone || !address || !items.length) return json({ error: 'بيانات الطلب ناقصة' }, 400);
        if (paymentMethod === 'vodafone_cash' && !receiptData.startsWith('data:image/')) return json({ error: 'صورة وصل التحويل مطلوبة' }, 400);
        if (paymentMethod === 'cod' && receiptData) return json({ error: 'لا ترسل إيصالًا مع الدفع عند الاستلام' }, 400);
        const ids = items.map((item) => Number(item.product_id)).filter(Boolean);
        if (!ids.length) return json({ error: 'المنتجات غير متاحة' }, 400);
        const placeholders = ids.map(() => '?').join(',');
        const products = (await env.DB.prepare(`SELECT id,name,price FROM products WHERE active=1 AND id IN (${placeholders})`).bind(...ids).all()).results;
        const byId = new Map(products.map((product) => [product.id, product]));
        let subtotal = 0;
        const normalized = [];
        for (const item of items) {
          const product = byId.get(Number(item.product_id));
          const quantity = Math.max(1, Math.min(99, Number(item.quantity || 1)));
          if (!product) continue;
          subtotal += product.price * quantity;
          normalized.push({ ...product, quantity });
        }
        if (!normalized.length) return json({ error: 'المنتجات غير متاحة' }, 400);
        const total = subtotal + SHIPPING_FEE;
        const order = await env.DB.prepare('INSERT INTO orders (customer_name,phone,address,notes,payment_method,shipping_fee,receipt_data,total) VALUES (?,?,?,?,?,?,?,?)')
          .bind(customer, phone, address, clean(body.notes, 500), paymentMethod, SHIPPING_FEE, receiptData, total).run();
        const statements = normalized.map((product) => env.DB.prepare('INSERT INTO order_items (order_id,product_id,product_name,unit_price,quantity) VALUES (?,?,?,?,?)')
          .bind(order.meta.last_row_id, product.id, product.name, product.price, product.quantity));
        await env.DB.batch(statements);
        return json({ ok: true, order_id: order.meta.last_row_id, subtotal, shipping_fee: SHIPPING_FEE, total, whatsapp: '201014761698' }, 201);
      }
      if (path.startsWith('/api/admin/')) {
        if (!isAdmin(request, env)) return json({ error: 'غير مصرح' }, 401);
        if (path === '/api/admin/products' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY sort_order, id').all();
          return json({ products: results });
        }
        if (path === '/api/admin/products' && request.method === 'POST') {
          const product = productPayload(await request.json());
          const result = await env.DB.prepare('INSERT INTO products (name,description,price,category,tag,image_url,media_type,active,sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
            .bind(product.name, product.description, product.price, product.category, product.tag, product.image_url, product.media_type, product.active, product.sort_order).run();
          return json({ ok: true, id: result.meta.last_row_id }, 201);
        }
        const productId = Number(path.split('/').pop());
        if (path.startsWith('/api/admin/products/') && request.method === 'PATCH') {
          const product = productPayload(await request.json());
          await env.DB.prepare('UPDATE products SET name=?,description=?,price=?,category=?,tag=?,image_url=?,media_type=?,active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .bind(product.name, product.description, product.price, product.category, product.tag, product.image_url, product.media_type, product.active, product.sort_order, productId).run();
          return json({ ok: true });
        }
        if (path.startsWith('/api/admin/products/') && request.method === 'DELETE') {
          await env.DB.prepare('UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(productId).run();
          return json({ ok: true });
        }
        if (path === '/api/admin/orders' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT id,customer_name,phone,address,notes,payment_method,shipping_fee,receipt_data,status,total,created_at FROM orders ORDER BY created_at DESC').all();
          return json({ orders: results });
        }
        if (path.startsWith('/api/admin/orders/') && request.method === 'PATCH') {
          const status = clean((await request.json()).status, 30);
          await env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, Number(path.split('/').pop())).run();
          return json({ ok: true });
        }
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: 'حدث خطأ في الخادم', detail: error.message }, 500);
    }
  }
};
