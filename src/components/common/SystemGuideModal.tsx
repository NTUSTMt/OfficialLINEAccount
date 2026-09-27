import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Compass, Tent, CreditCard, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface SystemGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemGuideModal: React.FC<SystemGuideModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinish = () => {
    try {
      localStorage.setItem('has_seen_member_system_guide', 'true');
    } catch (e) {
      console.warn('[SystemGuideModal] 無法寫入 localStorage:', e);
    }
    onClose();
  };

  const steps = [
    {
      icon: <ShieldCheck size={36} color="#059669" />,
      tag: t('guide.step1.tag'),
      title: t('guide.step1.title'),
      desc: t('guide.step1.desc'),
      accentColor: '#10b981',
      bgColor: '#ecfdf5'
    },
    {
      icon: <Compass size={36} color="#2563eb" />,
      tag: t('guide.step2.tag'),
      title: t('guide.step2.title'),
      desc: t('guide.step2.desc'),
      accentColor: '#3b82f6',
      bgColor: '#eff6ff'
    },
    {
      icon: <Tent size={36} color="#d97706" />,
      tag: t('guide.step3.tag'),
      title: t('guide.step3.title'),
      desc: t('guide.step3.desc'),
      accentColor: '#f59e0b',
      bgColor: '#fffbeb'
    },
    {
      icon: <CreditCard size={36} color="#7c3aed" />,
      tag: t('guide.step4.tag'),
      title: t('guide.step4.title'),
      desc: t('guide.step4.desc'),
      accentColor: '#8b5cf6',
      bgColor: '#f5f3ff'
    }
  ];

  const stepData = steps[currentStep];

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleFinish();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          maxHeight: 'min(88vh, calc(100dvh - 32px))',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          margin: 'auto'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            flexShrink: 0
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
              {t('guide.title')}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {t('guide.subtitle')}
            </div>
          </div>
          <button
            onClick={handleFinish}
            aria-label="Close"
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              transition: 'background 0.15s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Body */}
        <div
          style={{
            padding: '20px 22px 14px 22px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            flex: 1
          }}
        >
          {/* Step Icon & Tag */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                backgroundColor: stepData.bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1.5px solid ${stepData.accentColor}33`
              }}
            >
              {stepData.icon}
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: stepData.accentColor,
                backgroundColor: stepData.bgColor,
                padding: '4px 10px',
                borderRadius: '999px',
                border: `1px solid ${stepData.accentColor}40`
              }}
            >
              {stepData.tag}
            </div>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#0f172a',
              marginBottom: '10px',
              letterSpacing: '-0.01em'
            }}
          >
            {stepData.title}
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: '14px',
              lineHeight: '1.65',
              color: '#475569',
              minHeight: '84px'
            }}
          >
            {stepData.desc}
          </div>

          {/* Visual Highlight specifically for Step 2 (Avatar switching) */}
          {currentStep === 1 && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '12px',
                backgroundColor: '#f8fafc',
                border: '1px dashed #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                LINE
              </div>
              <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.4' }}>
                {t('guide.step2.avatarTip')}
              </div>
            </div>
          )}
        </div>

        {/* Progress Dots Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            paddingBottom: '14px',
            flexShrink: 0
          }}
        >
          {steps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              aria-label={`Step ${idx + 1}`}
              style={{
                width: currentStep === idx ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                backgroundColor: currentStep === idx ? '#059669' : '#cbd5e1',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            />
          ))}
        </div>

        {/* Bottom Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #f1f5f9',
            gap: '10px',
            flexShrink: 0
          }}
        >
          {currentStep > 0 ? (
            <button
              onClick={() => setCurrentStep((prev) => prev - 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <ChevronLeft size={16} />
              <span>{t('guide.prev')}</span>
            </button>
          ) : (
            <button
              onClick={handleFinish}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              {t('guide.skip')}
            </button>
          )}

          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => prev + 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)'
              }}
            >
              <span>{t('guide.next')}</span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.3)'
              }}
            >
              <Check size={16} />
              <span>{t('guide.start')}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
export default SystemGuideModal;
