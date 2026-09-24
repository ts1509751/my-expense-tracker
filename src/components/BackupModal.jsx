import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useExpense } from '../context/ExpenseContext';
import { useInvestment } from '../context/InvestmentContext';
import { db } from '../firebase/config';
import {
  generateBackupPayload,
  downloadBackupFile,
  parseAndValidateBackup,
  restoreBackupData,
} from '../utils/backupService';
import {
  X,
  Download,
  Upload,
  Database,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FolderArchive,
  Layers,
  Sparkles,
} from 'lucide-react';

const formatNum = (n) =>
  new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 0 }).format(n || 0);

export default function BackupModal({ isOpen, onClose }) {
  const {
    user,
    transactions,
    categories,
    categoryIcons,
    budgets,
    creditCards,
    recurringExpenses,
    theme,
    hideAmounts,
  } = useExpense();

  const { investments, investmentAccounts, dcaPlans } = useInvestment();

  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import'

  // Export states
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Import states
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'overwrite'
  const [isDragging, setIsDragging] = useState(false);
  const [importError, setImportError] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [progress, setProgress] = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);
  const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Handle Export Download
  const handleExport = () => {
    setIsExporting(true);
    try {
      const payload = generateBackupPayload({
        user,
        transactions,
        investments,
        categories,
        categoryIcons,
        budgets,
        creditCards,
        recurringExpenses,
        investmentAccounts,
        dcaPlans,
        theme,
        hideAmounts,
      });

      downloadBackupFile(payload);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3500);
    } catch (err) {
      alert(`備份匯出失敗：${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection & parsing
  const handleFileProcess = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setImportError(null);
    setRestoreResult(null);

    const res = await parseAndValidateBackup(selectedFile);
    if (res.success) {
      setParsedData(res.backupData);
      setSummary(res.summary);
    } else {
      setParsedData(null);
      setSummary(null);
      setImportError(res.error);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // Start Restore Action
  const handleStartRestore = () => {
    if (!parsedData) return;
    if (importMode === 'overwrite') {
      setShowConfirmOverwrite(true);
    } else {
      executeRestore('merge');
    }
  };

  const executeRestore = async (mode) => {
    setShowConfirmOverwrite(false);
    setIsRestoring(true);
    setImportError(null);
    setProgress({ percent: 5, status: '正在啟動資料還原作業...' });

    try {
      const result = await restoreBackupData({
        db,
        user,
        backupData: parsedData,
        mode,
        onProgress: (p) => setProgress(p),
      });

      setRestoreResult(result);
    } catch (err) {
      setImportError(`還原過程發生錯誤：${err.message}`);
    } finally {
      setIsRestoring(false);
      setProgress(null);
    }
  };

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet backup-manage-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-handle" />

        {/* Modal Header */}
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Database size={22} style={{ color: 'var(--accent-blue)' }} />
            <div className="modal-title" style={{ margin: 0 }}>資料備份與還原</div>
          </div>
          <button className="icon-btn modal-close-btn" onClick={onClose} aria-label="關閉">
            <X size={18} />
          </button>
        </div>
        <p className="modal-sub-hint">
          將您的所有收支帳本、投資明細、自訂分類與分帳戶匯出儲存為檔案，或從備份檔完整還原。
        </p>

        {/* Tab Switcher */}
        <div className="backup-tab-bar">
          <button
            type="button"
            className={`backup-tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('export');
              setImportError(null);
            }}
          >
            <Download size={16} />
            <span>匯出備份檔案</span>
          </button>
          <button
            type="button"
            className={`backup-tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <Upload size={16} />
            <span>匯入備份還原</span>
          </button>
        </div>

        {/* ── TAB 1: EXPORT ── */}
        {activeTab === 'export' && (
          <div className="backup-panel-content">
            <div className="backup-stat-card">
              <div className="backup-stat-header">
                <FolderArchive size={18} style={{ color: 'var(--accent-blue)' }} />
                <span>當前系統資料統計（即將備份）：</span>
              </div>
              <div className="backup-stat-grid">
                <div className="backup-stat-box">
                  <span className="stat-label">記帳明細</span>
                  <span className="stat-val">{formatNum(transactions.length)} 筆</span>
                </div>
                <div className="backup-stat-box">
                  <span className="stat-label">投資交易</span>
                  <span className="stat-val">{formatNum(investments.length)} 筆</span>
                </div>
                <div className="backup-stat-box">
                  <span className="stat-label">自訂分類</span>
                  <span className="stat-val">{formatNum(categories.length)} 個</span>
                </div>
                <div className="backup-stat-box">
                  <span className="stat-label">信用卡與額度</span>
                  <span className="stat-val">{formatNum(creditCards.length)} 張</span>
                </div>
                <div className="backup-stat-box">
                  <span className="stat-label">固定支出</span>
                  <span className="stat-val">{formatNum(recurringExpenses.length)} 筆</span>
                </div>
                <div className="backup-stat-box">
                  <span className="stat-label">分帳戶與定額</span>
                  <span className="stat-val">
                    {formatNum(investmentAccounts.length)} 帳戶 · {formatNum(dcaPlans.length)} 計畫
                  </span>
                </div>
              </div>
            </div>

            <div className="backup-instruction-box">
              <p>💡 <strong>溫馨提醒：</strong></p>
              <ul>
                <li>備份檔為標準 <code>.json</code> 格式，完整涵蓋您的個人收支紀錄與投資資料。</li>
                <li>建議每週或每月下載備份一次，以防誤刪或更換裝置時可快速匯入恢復。</li>
                <li>備份檔僅儲存於您本地電腦或手機下載資料夾，隱私安全無虞。</li>
              </ul>
            </div>

            {exportSuccess && (
              <div className="backup-success-alert">
                <CheckCircle2 size={18} />
                <span>備份檔案已順利下載至您的裝置！</span>
              </div>
            )}

            <button
              type="button"
              className="backup-action-submit-btn"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download size={18} />
              <span>{isExporting ? '正在生成備份檔...' : '立即下載完整備份檔案 (.json)'}</span>
            </button>
          </div>
        )}

        {/* ── TAB 2: IMPORT ── */}
        {activeTab === 'import' && (
          <div className="backup-panel-content">
            {/* File Dropzone */}
            <div
              className={`backup-dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileProcess(e.target.files[0]);
                }}
              />

              {file ? (
                <div className="dropzone-file-info">
                  <FileCheck size={36} style={{ color: 'var(--accent-green)' }} />
                  <div className="dropzone-filename">{file.name}</div>
                  <div className="dropzone-filesize">
                    ({(file.size / 1024).toFixed(1)} KB) · 點擊重新選取檔案
                  </div>
                </div>
              ) : (
                <div className="dropzone-prompt">
                  <Upload size={36} className="dropzone-icon" />
                  <div className="dropzone-text">點擊選取或拖曳 <code>.json</code> 備份檔案至此</div>
                  <div className="dropzone-sub">支援由本記帳系統匯出之所有備份檔案</div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {importError && (
              <div className="backup-error-alert">
                <AlertTriangle size={18} />
                <span>{importError}</span>
              </div>
            )}

            {/* Parsed Summary Preview Card */}
            {parsedData && summary && !isRestoring && !restoreResult && (
              <div className="backup-preview-card">
                <div className="preview-header">
                  <span className="preview-title">📋 備份檔案資料預覽</span>
                  <span className="preview-date">
                    備份時間：{new Date(parsedData.backupDate).toLocaleString('zh-TW', { hour12: false })}
                  </span>
                </div>

                <div className="backup-stat-grid" style={{ marginTop: '0.65rem' }}>
                  <div className="backup-stat-box">
                    <span className="stat-label">記帳紀錄</span>
                    <span className="stat-val">{formatNum(summary.transactionsCount)} 筆</span>
                  </div>
                  <div className="backup-stat-box">
                    <span className="stat-label">投資紀錄</span>
                    <span className="stat-val">{formatNum(summary.investmentsCount)} 筆</span>
                  </div>
                  <div className="backup-stat-box">
                    <span className="stat-label">自訂分類</span>
                    <span className="stat-val">{formatNum(summary.categoriesCount)} 個</span>
                  </div>
                  <div className="backup-stat-box">
                    <span className="stat-label">信用卡</span>
                    <span className="stat-val">{formatNum(summary.creditCardsCount)} 張</span>
                  </div>
                </div>

                {/* Import Mode Selector */}
                <div className="import-mode-section">
                  <div className="mode-section-title">選擇匯入方式：</div>
                  <div className="mode-options-grid">
                    <label
                      className={`mode-option-card ${importMode === 'merge' ? 'selected' : ''}`}
                      onClick={() => setImportMode('merge')}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                      />
                      <div className="mode-info">
                        <div className="mode-title-row">
                          <Layers size={16} style={{ color: 'var(--accent-green)' }} />
                          <span className="mode-name">合併匯入 (推薦)</span>
                        </div>
                        <p className="mode-desc">
                          保留現有紀錄，自動略過完全相同之重複交易，並補齊缺少之資料與設定。
                        </p>
                      </div>
                    </label>

                    <label
                      className={`mode-option-card danger ${importMode === 'overwrite' ? 'selected' : ''}`}
                      onClick={() => setImportMode('overwrite')}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'overwrite'}
                        onChange={() => setImportMode('overwrite')}
                      />
                      <div className="mode-info">
                        <div className="mode-title-row">
                          <AlertTriangle size={16} style={{ color: 'var(--accent-red)' }} />
                          <span className="mode-name">完全覆蓋取代</span>
                        </div>
                        <p className="mode-desc">
                          清空目前帳本中所有舊資料，完全以備份檔中的內容還原。
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Start Restore Button */}
                <button
                  type="button"
                  className={`backup-action-submit-btn ${importMode === 'overwrite' ? 'btn-danger' : ''}`}
                  onClick={handleStartRestore}
                >
                  <RefreshCw size={18} />
                  <span>
                    {importMode === 'overwrite'
                      ? '⚠️ 完全覆蓋並還原資料'
                      : '⚡ 開始合併匯入資料'}
                  </span>
                </button>
              </div>
            )}

            {/* Restoring Progress Indicator */}
            {isRestoring && progress && (
              <div className="backup-progress-card">
                <div className="progress-spinner-row">
                  <div className="spinner small" />
                  <span className="progress-status-text">{progress.status}</span>
                </div>
                <div className="backup-progress-bar-bg">
                  <div
                    className="backup-progress-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="progress-percent-label">{progress.percent}%</div>
              </div>
            )}

            {/* Restore Finished Summary */}
            {restoreResult && (
              <div className="backup-finish-card">
                <div className="finish-icon-wrapper">
                  <CheckCircle2 size={44} style={{ color: 'var(--accent-green)' }} />
                </div>
                <h3 className="finish-title">資料還原成功！</h3>
                <p className="finish-desc">
                  已成功{restoreResult.mode === 'overwrite' ? '覆蓋還原' : '合併匯入'}{' '}
                  <strong>{formatNum(restoreResult.importedTransactions)}</strong> 筆收支明細與{' '}
                  <strong>{formatNum(restoreResult.importedInvestments)}</strong> 筆投資紀錄。
                  所有分類、卡片與分帳戶已完成即時同步。
                </p>
                <button
                  type="button"
                  className="btn-blue"
                  style={{ width: '100%', marginTop: '1rem', padding: '0.75rem' }}
                  onClick={onClose}
                >
                  完成並返回
                </button>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: '1rem' }}>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={onClose}>
            關閉
          </button>
        </div>
      </div>

      {/* ── Confirm Overwrite Dialog ── */}
      {showConfirmOverwrite && (
        <div className="modal-overlay" style={{ zIndex: 700 }} onClick={() => setShowConfirmOverwrite(false)}>
          <div className="confirm-delete-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-delete-icon" style={{ background: 'var(--accent-red-dim)', color: 'var(--accent-red)' }}>
              <AlertTriangle size={30} />
            </div>
            <h3 className="confirm-delete-title" style={{ color: 'var(--accent-red)' }}>
              確認要完全覆蓋現有資料？
            </h3>
            <p className="confirm-delete-desc">
              ⚠️ 此操作將會<strong>永久清除</strong>您目前帳本中的所有收支與投資紀錄，並完全由備份檔（共{' '}
              {summary?.transactionsCount || 0} 筆收支、{summary?.investmentsCount || 0} 筆投資）取代！
              <br />
              <strong>此動作無法復原，您確定要繼續執行嗎？</strong>
            </p>
            <div className="confirm-delete-actions">
              <button
                type="button"
                className="confirm-btn cancel"
                onClick={() => setShowConfirmOverwrite(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="confirm-btn delete"
                onClick={() => executeRestore('overwrite')}
              >
                確認覆蓋還原
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
