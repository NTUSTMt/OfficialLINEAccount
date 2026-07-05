import '../App.css';

function Payment() {
  return (
    <div className="app-container">
      {/* 頂部導覽列 */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">💰</span>
          <div className="logo-text">
            <h1>繳費對帳</h1>
            <p>Payment System</p>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="promo-banner" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)' }}>
          <div className="banner-content">
            <span className="banner-tag">費用繳納與對帳</span>
            <h2>合併結帳，輕鬆對帳</h2>
            <p>選取多筆租借訂單，一鍵合併繳費，快速上傳收據憑證</p>
          </div>
        </div>

        <div className="drawer-section" style={{ backgroundColor: 'white', marginTop: '20px' }}>
          <div className="empty-cart-state" style={{ padding: '40px 10px' }}>
            <span className="empty-icon">💸</span>
            <h3 style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>無未繳費項目</h3>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
              目前查無您需要繳納的裝備租用費用。<br />
              若剛送出申請，請等候幹部審核與系統拋轉。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Payment;
