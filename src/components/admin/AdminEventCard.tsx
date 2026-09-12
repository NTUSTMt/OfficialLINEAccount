import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  CircleDollarSign,
  Users,
  CheckCircle2,
  Clock4,
  AlertCircle,
  Pencil,
  ClipboardCheck,
  ImageIcon
} from 'lucide-react';
import type { AdminEvent } from '../../types/event';
import { getDirectImageUrl } from '../../utils/image';

interface AdminEventCardProps {
  evt: AdminEvent;
  onEdit: (evt: AdminEvent) => void;
  onOpenSignups: (evt: AdminEvent) => void;
  onQuickStatusChange: (eventId: string, newStatus: string) => void;
}

export const AdminEventCard: React.FC<AdminEventCardProps> = ({
  evt,
  onEdit,
  onOpenSignups,
  onQuickStatusChange
}) => {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  const imgDirect = evt.imageUrl ? (getDirectImageUrl(evt.imageUrl, 400) || evt.imageUrl) : '';
  const hasPending = evt.stats.pending > 0;
  const isDeadlinePassed = useMemo(() => {
    if (!evt.deadline) return false;
    try {
      const clean = evt.deadline.replace(/\//g, '-').trim();
      const parts = clean.split(' ')[0].split('-');
      if (parts.length >= 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59);
        return !isNaN(d.getTime()) && now > d.getTime();
      }
    } catch {
      return false;
    }
    return false;
  }, [evt.deadline, now]);

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '16px',
        boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
    >
      {/* 1. 卡片頂部列：狀態標籤 + ID + 狀態快速切換 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '3px 10px',
            borderRadius: '20px',
            backgroundColor: evt.status === '開放' ? '#dcfce7' : evt.status === '未來開放' ? '#ffedd5' : '#f1f5f9',
            color: evt.status === '開放' ? '#15803d' : evt.status === '未來開放' ? '#c2410c' : '#64748b',
            border: `1px solid ${evt.status === '開放' ? '#bbf7d0' : evt.status === '未來開放' ? '#fed7aa' : '#e2e8f0'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: evt.status === '開放' ? '#16a34a' : evt.status === '未來開放' ? '#ea580c' : '#94a3b8',
              display: 'inline-block'
            }} />
            <span>{evt.status === '開放' ? '開放報名' : evt.status === '未來開放' ? '未來開放' : '已關閉'}</span>
          </span>
          <span style={{
            fontSize: '12px',
            color: '#64748b',
            fontFamily: 'monospace',
            backgroundColor: '#f8fafc',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            #{evt.id}
          </span>
        </div>

        {/* 快速切換狀態選單 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>狀態:</span>
          <select
            value={evt.status}
            onChange={(e) => onQuickStatusChange(evt.id, e.target.value)}
            style={{
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: '#f8fafc',
              color: '#1e293b',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="開放">開放</option>
            <option value="未來開放">未來開放</option>
            <option value="關閉">關閉</option>
          </select>
        </div>
      </div>

      {/* 2. 主視覺縮圖與活動標題 */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <div
          style={{
            width: '96px',
            height: '76px',
            borderRadius: '12px',
            backgroundColor: '#f1f5f9',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #e2e8f0'
          }}
        >
          {imgDirect ? (
            <img src={imgDirect} alt={evt.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <ImageIcon size={28} color="#94a3b8" />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin: 0,
            fontSize: '17px',
            fontWeight: 'bold',
            color: '#0f172a',
            lineHeight: '1.4',
            wordBreak: 'break-word'
          }}>
            {evt.name}
          </h3>
          {evt.shortDesc && (
            <p style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: '#64748b',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {evt.shortDesc}
            </p>
          )}
        </div>
      </div>

      {/* 3. 核心時程與費用資訊格 (Info Chips) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '8px'
      }}>
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '8px 10px',
          borderRadius: '10px',
          border: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={13} /> 出隊日程
          </span>
          <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 'bold' }}>
            {evt.startDate} ~ {evt.endDate}
          </span>
        </div>

        <div style={{
          backgroundColor: '#f8fafc',
          padding: '8px 10px',
          borderRadius: '10px',
          border: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={13} /> 報名截止
          </span>
          <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 'bold' }}>
            {evt.deadline}
            {isDeadlinePassed && (
              <span style={{ color: '#ef4444', fontSize: '11px', marginLeft: '4px' }}>(已截止)</span>
            )}
          </span>
        </div>

        <div style={{
          backgroundColor: '#f8fafc',
          padding: '8px 10px',
          borderRadius: '10px',
          border: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CircleDollarSign size={13} /> 活動費用
          </span>
          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>
            NT$ {evt.cost}
          </span>
        </div>
      </div>

      {/* 4. 報名數據指標看板 (4 色獨立膠囊卡片) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px'
      }}>
        {/* 總報名 */}
        <div style={{
          backgroundColor: '#eff6ff',
          borderRadius: '10px',
          padding: '8px 4px',
          textAlign: 'center',
          border: '1px solid #dbeafe'
        }}>
          <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            <Users size={12} /> 總報名
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1d4ed8', marginTop: '2px' }}>
            {evt.stats.total}
          </div>
        </div>

        {/* 正取 */}
        <div style={{
          backgroundColor: '#ecfdf5',
          borderRadius: '10px',
          padding: '8px 4px',
          textAlign: 'center',
          border: '1px solid #a7f3d0'
        }}>
          <div style={{ fontSize: '11px', color: '#059669', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            <CheckCircle2 size={12} /> 正取
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#047857', marginTop: '2px' }}>
            {evt.stats.accepted}
          </div>
        </div>

        {/* 備取 */}
        <div style={{
          backgroundColor: '#fff7ed',
          borderRadius: '10px',
          padding: '8px 4px',
          textAlign: 'center',
          border: '1px solid #fed7aa'
        }}>
          <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            <Clock4 size={12} /> 備取
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#c2410c', marginTop: '2px' }}>
            {evt.stats.waitlisted}
          </div>
        </div>

        {/* 待審核 */}
        <div style={{
          backgroundColor: hasPending ? '#fef2f2' : '#f8fafc',
          borderRadius: '10px',
          padding: '8px 4px',
          textAlign: 'center',
          border: `1px solid ${hasPending ? '#fecaca' : '#e2e8f0'}`,
          position: 'relative'
        }}>
          {hasPending && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '6px',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#ef4444'
            }} />
          )}
          <div style={{ fontSize: '11px', color: hasPending ? '#dc2626' : '#64748b', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            <AlertCircle size={12} /> 待審核
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: hasPending ? '#b91c1c' : '#64748b', marginTop: '2px' }}>
            {evt.stats.pending}
          </div>
        </div>
      </div>

      {/* 5. 卡片底部操作按鈕組 */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderTop: '1px solid #f1f5f9',
        paddingTop: '12px'
      }}>
        <button
          type="button"
          onClick={() => onEdit(evt)}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '10px',
            border: '1.5px solid #cbd5e1',
            backgroundColor: 'white',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
        >
          <Pencil size={13} />
          <span>{t('adminEvents.btnEdit')}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenSignups(evt)}
          style={{
            flex: 1.3,
            padding: '9px 16px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#059669',
            color: 'white',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
            transition: 'all 0.2s'
          }}
        >
          <ClipboardCheck size={14} />
          <span>{t('adminEvents.btnSignups')}</span>
          {hasPending ? (
            <span style={{
              backgroundColor: '#ef4444',
              color: 'white',
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '999px',
              fontWeight: 'bold'
            }}>
              {evt.stats.pending} 待審
            </span>
          ) : (
            <span style={{ opacity: 0.85, fontSize: '12px' }}>({evt.stats.total})</span>
          )}
        </button>
      </div>
    </div>
  );
};
