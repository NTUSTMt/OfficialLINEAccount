import { useState, useMemo } from 'react';
import { Mountain, Tent, Moon, Package, Compass, Flame, Shield } from 'lucide-react';
import { getDirectImageUrl } from '../../utils/image';

interface ProductImageProps {
  name: string;
  imageUrl?: string;
}

export function ProductImage({ name, imageUrl }: ProductImageProps) {
  const [errorUrl, setErrorUrl] = useState<string | null>(null);

  // 取第一個網址
  const firstUrl = useMemo(() => {
    if (!imageUrl) return undefined;
    return imageUrl.split(/[\n,，;\s]+/).map(u => u.trim()).find(u => u.startsWith('http'));
  }, [imageUrl]);

  const directUrl = useMemo(() => {
    return getDirectImageUrl(firstUrl, 400);
  }, [firstUrl]);

  const hasError = errorUrl === directUrl;

  if (directUrl && !hasError) {
    return (
      <div className="product-img-container">
        <img
          src={directUrl}
          alt={name}
          className="product-img-real"
          loading="lazy"
          onError={() => setErrorUrl(directUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  const lowercaseName = name.toLowerCase();
  let icon = <Mountain size={36} color="#64748b" />;
  let bgClass = 'bg-default';

  // 帳篷
  if (lowercaseName.includes('帳') || lowercaseName.includes('tent')) {
    icon = <Tent size={36} color="#059669" />;
    bgClass = 'bg-tent';
  }
  // 睡墊/睡袋
  else if (lowercaseName.includes('墊') || lowercaseName.includes('袋') || lowercaseName.includes('pad') || lowercaseName.includes('sleeping')) {
    icon = <Moon size={36} color="#4f46e5" />;
    bgClass = 'bg-pad';
  }
  // 背包
  else if (lowercaseName.includes('包') || lowercaseName.includes('pack')) {
    icon = <Package size={36} color="#0891b2" />;
    bgClass = 'bg-pack';
  }
  // 登山杖
  else if (lowercaseName.includes('杖') || lowercaseName.includes('pole') || lowercaseName.includes('stick')) {
    icon = <Compass size={36} color="#d97706" />;
    bgClass = 'bg-pole';
  }
  // 鋼盆/炊具/爐
  else if (lowercaseName.includes('盆') || lowercaseName.includes('鍋') || lowercaseName.includes('爐') || lowercaseName.includes('cook') || lowercaseName.includes('stove')) {
    icon = <Flame size={36} color="#dc2626" />;
    bgClass = 'bg-bowl';
  }
  // 頭盔/岩盔/吊帶/攀登
  else if (lowercaseName.includes('盔') || lowercaseName.includes('吊帶') || lowercaseName.includes('繩') || lowercaseName.includes('harness') || lowercaseName.includes('helmet')) {
    icon = <Shield size={36} color="#7c3aed" />;
    bgClass = 'bg-default';
  }

  return (
    <div className={`product-img-container ${bgClass}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
  );
}
