'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AddToBag, unitAr } from '@/components/store/commerce/AddToBag';
import { WishButton } from '@/components/store/commerce/WishButton';
import { PriceTag, discountLabel } from '@/components/store/ui';
import type { ProductCard } from '@/types';
import { Photo } from '@/components/store/photo';

/**
 * The approved discovery card: art-directed field, bottle, tilt + glare
 * (engine, via data-tilt), wishlist, size choice and quick add — all real.
 */
export function ProductTile({
  product,
  index = 0,
  variant = 'grid',
  priority = false,
}: {
  product: ProductCard;
  index?: number;
  variant?: 'grid' | 'editorial';
  priority?: boolean;
}) {
  const variants = product.variants ?? [];
  const firstAvailable = variants.find((v) => v.stockLevel !== 'OUT_OF_STOCK') ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstAvailable?.id);
  const selected = variants.find((v) => v.id === selectedId) ?? firstAvailable;
  const name = product.nameAr || product.name;
  const off = discountLabel(product.minPrice, product.compareAtPrice);
  const soldOut = product.inStock === false || !selected || variants.every((v) => v.stockLevel === 'OUT_OF_STOCK');
  const low = selected?.stockLevel === 'LOW_STOCK';

  return (
    <article
      className={`vp-pcard vp-field--${product.artField ?? 'ink'}${variant === 'editorial' ? ` vp-pcard--${index % 5}` : ''}${soldOut ? ' is-soldout' : ''}`}
      data-family={product.familySlug ?? ''}
      data-tilt
      data-reveal="img"
      data-cursor="عرض"
    >
      <Link href={`/products/${product.slug}`} className="vp-pcard__media" data-transition aria-label={name} tabIndex={-1}>
        {product.image ? (
          <Photo
            src={product.image}
            alt={name}
            width={700}
            height={940}
            sizes="(max-width: 899px) 270px, 490px"
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          <span className="vp-pcard__placeholder" aria-hidden="true">
            {product.name}
          </span>
        )}
        <span className="vp-pcard__glare" aria-hidden="true" />
      </Link>
      <div className="vp-pcard__flags">
        {soldOut && <span className="is-out">نفد</span>}
        {!soldOut && product.isBestSeller && <span>الأكثر مبيعًا</span>}
        {!soldOut && product.isNew && <span>جديد</span>}
        {!soldOut && off && <span className="is-sale">{off}</span>}
      </div>
      <WishButton productId={product.id} name={name} />
      <div className="vp-pcard__info">
        <Link href={`/products/${product.slug}`} data-transition>
          <h3>{name}</h3>
          <span dir="ltr">{product.name}</span>
        </Link>
        <div className="vp-pcard__row">
          <PriceTag price={selected?.price ?? product.minPrice} compareAt={selected ? selected.compareAtPrice : product.compareAtPrice} />
          {product.family && <span className="vp-pcard__fam">{product.family}</span>}
        </div>
      </div>
      <div className="vp-pcard__quick">
        {variants.length > 1 && (
          <div className="vp-sizes" role="radiogroup" aria-label="الحجم">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === selected?.id}
                className={v.id === selected?.id ? 'is-active' : ''}
                disabled={v.stockLevel === 'OUT_OF_STOCK'}
                onClick={() => setSelectedId(v.id)}
              >
                {v.size} {unitAr(v.unit)}
              </button>
            ))}
          </div>
        )}
        {low && <span className="vp-pcard__low">كمية محدودة</span>}
        <AddToBag
          compact
          className="vp-pcard__add"
          product={{ id: product.id, slug: product.slug, name, image: product.image }}
          variant={selected}
        />
      </div>
    </article>
  );
}
