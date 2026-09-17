import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Users, CreditCard, PackageCheck, Layers } from 'lucide-react';

interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'events', path: '/admin/events', label: '活動管理', icon: Calendar },
  { key: 'members', path: '/admin/members', label: '社員資料', icon: Users },
  { key: 'finance', path: '/admin/finance', label: '財務對帳', icon: CreditCard },
  { key: 'loans', path: '/admin/loans', label: '租借管理', icon: PackageCheck },
  { key: 'inventory', path: '/admin/inventory', label: '裝備庫存', icon: Layers }
];

export const AdminSubNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isCurrentActive = (path: string) => {
    if (path === '/admin/members') {
      return location.pathname.startsWith('/admin/members');
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <div style={{
      position: 'sticky',
      top: 56,
      zIndex: 90,
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '6px 12px',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        {NAV_ITEMS.map((item) => {
          const active = isCurrentActive(item.path);
          const IconComponent = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                color: active ? '#059669' : '#64748b',
                backgroundColor: active ? '#ecfdf5' : 'transparent',
                border: active ? '1px solid #a7f3d0' : '1px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              <IconComponent size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
