import { useState } from 'react';
import { Settings, Sun, Moon, LogOut, FileSpreadsheet, Tag, CreditCard, Clock, Eye, EyeOff, Database } from 'lucide-react';
import { useExpense } from '../context/ExpenseContext';
import ExportModal from './ExportModal';
import CategoryModal from './CategoryModal';
import CreditCardModal from './CreditCardModal';
import RecurringModal from './RecurringModal';
import BackupModal from './BackupModal';

export default function SettingsModal() {
  const { theme, toggleTheme, logout, user, hideAmounts, toggleHideAmounts } = useExpense();
  const [open, setOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="設定">
        <Settings size={20} />
      </button>

      {open && (
        <>
          <div className="settings-overlay" onClick={() => setOpen(false)} />
          <div className="settings-sheet">
            {/* User info */}
            <div style={{ padding: '0.8rem 1rem 0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>已登入</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.displayName || user?.email || '使用者'}
              </div>
            </div>

            {/* Category Management */}
            <button
              className="settings-item"
              onClick={() => { setShowCategoryModal(true); setOpen(false); }}
            >
              <Tag size={18} style={{ color: 'var(--accent-blue)' }} />
              分類管理與圖示修改
            </button>

            {/* Credit Card Management */}
            <button
              className="settings-item"
              onClick={() => { setShowCreditCardModal(true); setOpen(false); }}
            >
              <CreditCard size={18} style={{ color: '#8b5cf6' }} />
              信用卡額度管理
            </button>

            {/* Recurring Expenses (Auto-Bookkeeping) */}
            <button
              className="settings-item"
              onClick={() => { setShowRecurringModal(true); setOpen(false); }}
            >
              <Clock size={18} style={{ color: 'var(--accent-orange)' }} />
              固定支出 (自動記帳)
            </button>

            {/* Theme toggle */}
            <button className="settings-item" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              {theme === 'dark' ? '切換亮色模式' : '切換深色模式'}
              <label className="toggle-switch" style={{ pointerEvents: 'none' }}>
                <input type="checkbox" checked={theme === 'light'} readOnly />
                <span className="toggle-slider" />
              </label>
            </button>

            {/* Hide Amounts (Privacy Mode) toggle */}
            <button className="settings-item" onClick={toggleHideAmounts}>
              {hideAmounts ? <EyeOff size={18} style={{ color: 'var(--accent-orange)' }} /> : <Eye size={18} />}
              首頁隱藏金額模式
              <label className="toggle-switch" style={{ pointerEvents: 'none' }}>
                <input type="checkbox" checked={hideAmounts} readOnly />
                <span className="toggle-slider" />
              </label>
            </button>

            {/* Export Excel */}
            <button className="settings-item" onClick={() => { setShowExport(true); setOpen(false); }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--accent-green)' }} />
              匯出 Excel 報表 (.xlsx)
            </button>

            {/* Backup & Restore JSON */}
            <button className="settings-item" onClick={() => { setShowBackupModal(true); setOpen(false); }}>
              <Database size={18} style={{ color: '#06b6d4' }} />
              資料備份與還原 (.json)
            </button>

            <div className="settings-divider" />

            {/* Logout */}
            <button className="settings-item danger" onClick={() => { logout(); setOpen(false); }}>
              <LogOut size={18} />
              登出帳號
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      <ExportModal isOpen={showExport} onClose={() => setShowExport(false)} />
      <CategoryModal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} />
      <CreditCardModal isOpen={showCreditCardModal} onClose={() => setShowCreditCardModal(false)} />
      <RecurringModal isOpen={showRecurringModal} onClose={() => setShowRecurringModal(false)} />
      <BackupModal isOpen={showBackupModal} onClose={() => setShowBackupModal(false)} />
    </>
  );
}

