import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendQuickNote,
  buildRoomRenderPrompt,
  canAddProduct,
  chooseNearestAspectRatio,
  computeResizedDimensions,
  createSettingsSignature,
  findLowestPriceId,
  formatPrice,
  normalizeShopifyProduct,
  normalizeShopifySearchResponse,
  parsePriceNumeric,
} from './sceneMath';
import type { ProductItem } from '../types/studio';

test('chooseNearestAspectRatio maps dimensions to nearest supported Gemini ratio', () => {
  assert.equal(chooseNearestAspectRatio(1000, 1000), '1:1');
  assert.equal(chooseNearestAspectRatio(1400, 1050), '4:3');
  assert.equal(chooseNearestAspectRatio(1920, 1080), '16:9');
  assert.equal(chooseNearestAspectRatio(900, 1200), '3:4');
  assert.equal(chooseNearestAspectRatio(1080, 1920), '9:16');
  assert.equal(chooseNearestAspectRatio(0, 0), '4:3');
});

test('computeResizedDimensions caps longest side at 1400px and never upscales', () => {
  const landscape = computeResizedDimensions(4000, 3000, 1400);
  assert.deepEqual(landscape, { width: 1400, height: 1050, wasResized: true });

  const portrait = computeResizedDimensions(2000, 2800, 1400);
  assert.deepEqual(portrait, { width: 1000, height: 1400, wasResized: true });

  const small = computeResizedDimensions(800, 600, 1400);
  assert.deepEqual(small, { width: 800, height: 600, wasResized: false });

  const exact = computeResizedDimensions(1400, 900, 1400);
  assert.deepEqual(exact, { width: 1400, height: 900, wasResized: false });
});

test('parsePriceNumeric and formatPrice handle strings, numbers, and objects', () => {
  assert.equal(parsePriceNumeric('$249.50'), 249.5);
  assert.equal(parsePriceNumeric(320), 320);
  assert.equal(parsePriceNumeric({ amount: '185.00' }), 185);
  assert.equal(parsePriceNumeric('invalid'), null);
  assert.equal(formatPrice(249, 'USD'), '$249');
  assert.equal(formatPrice(249.5, 'USD'), '$249.50');
  assert.equal(formatPrice(null), 'Price unavailable');
});

test('normalizeShopifyProduct parses nested variants, media, and rating', () => {
  const item = normalizeShopifyProduct({
    product_id: 'gid://shopify/Product/101',
    title: 'Aurelia Brass Table Lamp',
    vendor: 'Nordic Form',
    shop: { name: 'Nordic Form Studio', url: 'https://nordicform.example.com' },
    price_range: { min: 280, currency: 'USD' },
    rating: { rating: 4.85, count: 64 },
    images: [
      { url: 'https://cdn.example.com/lamp-1.jpg' },
      { url: 'https://cdn.example.com/lamp-2.jpg' },
    ],
    variants: [
      {
        id: 'var-brass',
        title: 'Brushed Brass',
        price: 280,
        available: true,
        image_url: 'https://cdn.example.com/lamp-brass.jpg',
      },
      {
        id: 'var-black',
        title: 'Matte Black',
        price: 265,
        available: false,
      },
    ],
    features: ['Solid spun brass shade', 'Inline dimmer switch'],
  });

  assert.ok(item);
  assert.equal(item.title, 'Aurelia Brass Table Lamp');
  assert.equal(item.store, 'Nordic Form Studio');
  assert.equal(item.price, '$280');
  assert.equal(item.rating, 4.9);
  assert.equal(item.reviewCount, 64);
  assert.equal(item.variants.length, 2);
  assert.equal(item.selectedVariantId, 'var-brass');
  assert.equal(item.images.length, 3);
  assert.deepEqual(item.features, ['Solid spun brass shade', 'Inline dimmer switch']);
});

test('normalizeShopifySearchResponse unwraps offers and products collections', () => {
  const list = normalizeShopifySearchResponse({
    products: [
      { id: '1', title: 'Lamp A', price: 120 },
      { id: '2', title: 'Lamp B', price: 190 },
    ],
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'Lamp A');
  assert.equal(list[1].priceNumeric, 190);
});

test('findLowestPriceId picks cheapest product using active variant price', () => {
  const products: ProductItem[] = [
    {
      id: 'p1',
      source: 'sample',
      title: 'Brass Lamp',
      brand: 'A',
      store: 'A',
      price: '$310',
      priceNumeric: 310,
      currency: 'USD',
      availability: 'In Stock',
      rating: 4.8,
      reviewCount: 20,
      features: [],
      images: [],
      selectedImageIndex: 0,
      variants: [
        { id: 'v1', title: 'Brass', price: '$310', priceNumeric: 310, currency: 'USD', available: true },
      ],
      selectedVariantId: 'v1',
    },
    {
      id: 'p2',
      source: 'sample',
      title: 'Glass Lamp',
      brand: 'B',
      store: 'B',
      price: '$245',
      priceNumeric: 245,
      currency: 'USD',
      availability: 'In Stock',
      rating: 4.6,
      reviewCount: 15,
      features: [],
      images: [],
      selectedImageIndex: 0,
      variants: [
        { id: 'v2', title: 'Amber', price: '$220', priceNumeric: 220, currency: 'USD', available: true },
      ],
      selectedVariantId: 'v2',
    },
  ];
  assert.equal(findLowestPriceId(products), 'p2');
  assert.equal(findLowestPriceId([products[0]]), null);
  assert.equal(canAddProduct(3), true);
  assert.equal(canAddProduct(4), false);
});

test('appendQuickNote avoids duplicate chips and formats punctuation cleanly', () => {
  assert.equal(appendQuickNote('', 'Center on the main surface'), 'Center on the main surface');
  assert.equal(
    appendQuickNote('Center on the main surface', 'Keep power cord tucked out of sight'),
    'Center on the main surface. Keep power cord tucked out of sight'
  );
  assert.equal(
    appendQuickNote('Center on the main surface', 'center on the main surface'),
    'Center on the main surface'
  );
});

test('buildRoomRenderPrompt includes placement, lighting mood, product details, and custom notes', () => {
  const prompt = buildRoomRenderPrompt({
    productName: 'Solstice Brass Lamp',
    productBrand: 'Atelier Nord',
    variantLabel: 'Brushed Brass',
    placement: 'Coffee Table',
    lightingMood: 'Warm Lamp',
    customNotes: 'Replace existing ceramic lamp on the right',
  });
  assert.match(prompt, /Atelier Nord Solstice Brass Lamp \(Brushed Brass\)/);
  assert.match(prompt, /coffee table/i);
  assert.match(prompt, /2700K/i);
  assert.match(prompt, /Replace existing ceramic lamp on the right/);

  const sig = createSettingsSignature(
    { placement: 'Coffee Table', lightingMood: 'Warm Lamp', customNotes: 'test' },
    'room-1',
    '/img.jpg',
    'var-1'
  );
  assert.ok(sig.includes('Coffee Table'));
});
