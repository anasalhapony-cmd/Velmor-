import Link from 'next/link';
import { getSettings, settingString } from '@/lib/settings';
import { getFooterPages } from '@/lib/cms/queries';
import { DEFAULT_WHATSAPP } from '@/config/site';
import { whatsappUrl } from '@/lib/utils/format';
import { Icon } from '@/components/store/ui';

export async function StoreFooter() {
  const [s, pages] = await Promise.all([getSettings(), getFooterPages()]);
  const whatsapp = settingString(s, 'whatsapp_number', DEFAULT_WHATSAPP);
  const socials = [
    ['Instagram', settingString(s, 'social_instagram')],
    ['Facebook', settingString(s, 'social_facebook')],
    ['TikTok', settingString(s, 'social_tiktok')],
  ].filter(([, url]) => /^https:\/\//.test(url));

  return (
    <footer className="vp-footer">
      <div className="vp-wrap vp-footer__top">
        <div className="vp-footer__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/brand/logo-cream.webp" alt="VELMOR" width={150} height={66} />
          <p>علامة عطور ليبية عصرية لجيلٍ جديد من الرجال — أناقة بحضور.</p>
          <p className="vp-footer__note">
            عطور VELMOR تفسيرات مستقلة لطابع عطري؛ لا تربطها أي علاقة تجارية بدور العطور الأخرى.
          </p>
        </div>
        <nav aria-label="المتجر" className="vp-footer__col">
          <h2>المتجر</h2>
          <Link href="/products" className="vp-link">كل العطور</Link>
          <Link href="/products?flag=new" className="vp-link">وصل حديثًا</Link>
          <Link href="/products?flag=best" className="vp-link">الأكثر مبيعًا</Link>
          <Link href="/finder" className="vp-link">مستشار العطور</Link>
        </nav>
        <nav aria-label="المساعدة" className="vp-footer__col">
          <h2>المساعدة</h2>
          <Link href="/track-order" className="vp-link">تتبّع الطلب</Link>
          <Link href="/faq" className="vp-link">الأسئلة الشائعة</Link>
          {pages.map((p) => (
            <Link key={p.slug} href={`/pages/${p.slug}`} className="vp-link">
              {p.title}
            </Link>
          ))}
        </nav>
        <div className="vp-footer__col">
          <h2>تواصل</h2>
          <a href={whatsappUrl(whatsapp)} target="_blank" rel="noopener noreferrer" className="vp-footer__wa">
            <Icon name="whatsapp" size={18} />
            <span dir="ltr">{whatsapp}</span>
          </a>
          {socials.map(([label, url]) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="vp-link" dir="ltr">
              {label}
            </a>
          ))}
        </div>
      </div>
      <div className="vp-wrap vp-footer__bottom">
        <p>
          © {new Date().getFullYear()} VELMOR · <span dir="ltr">Elegance with attitude</span>
        </p>
        <p>
          صمم من قبل استوديو شبكة · <a href="tel:0934341814" dir="ltr" className="hover:underline">0934341814</a>
        </p>
      </div>
    </footer>
  );
}