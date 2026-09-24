import { collection, doc, writeBatch, getDocs, query, where, setDoc } from 'firebase/firestore';

/**
 * Generates the standardized backup payload object.
 */
export function generateBackupPayload({
  user,
  transactions = [],
  investments = [],
  categories = [],
  categoryIcons = {},
  budgets = {},
  creditCards = [],
  recurringExpenses = [],
  investmentAccounts = [],
  dcaPlans = [],
  theme = 'dark',
  hideAmounts = false,
}) {
  const now = new Date().toISOString();

  // Strip local IDs or clean data if needed, while keeping important fields
  const cleanTransactions = transactions.map(({ id, ...rest }) => ({
    ...rest,
    uid: user?.uid || rest.uid,
  }));

  const cleanInvestments = investments.map(({ id, ...rest }) => ({
    ...rest,
    uid: user?.uid || rest.uid,
  }));

  const payload = {
    version: 1,
    appName: 'my-expense-tracker',
    backupDate: now,
    user: {
      uid: user?.uid || '',
      email: user?.email || '',
      displayName: user?.displayName || '',
    },
    summary: {
      transactionsCount: cleanTransactions.length,
      investmentsCount: cleanInvestments.length,
      categoriesCount: categories.length,
      creditCardsCount: creditCards.length,
      recurringCount: recurringExpenses.length,
      investmentAccountsCount: investmentAccounts.length,
      dcaPlansCount: dcaPlans.length,
    },
    data: {
      transactions: cleanTransactions,
      investments: cleanInvestments,
      userBudget: {
        categories,
        categoryIcons,
        budgets,
        creditCards,
        recurringExpenses,
        investmentAccounts,
        dcaPlans,
      },
      preferences: {
        theme,
        hideAmounts,
      },
    },
  };

  return payload;
}

/**
 * Triggers a browser file download of the backup JSON file.
 */
export function downloadBackupFile(backupPayload) {
  const jsonString = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const fileName = `my_expense_backup_${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses and validates an uploaded backup file.
 * Returns { success: true, backupData, summary } or { success: false, error }
 */
export async function parseAndValidateBackup(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve({ success: false, error: '未選擇任何檔案' });
      return;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
      resolve({ success: false, error: '檔案格式錯誤，請選取 .json 備份檔' });
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = JSON.parse(text);

        // Validation check
        const hasData = parsed && (parsed.data || parsed.transactions || parsed.summary);
        if (!hasData) {
          resolve({ success: false, error: '此檔案非本記帳系統的有效備份檔或內容已損壞' });
          return;
        }

        // Normalize format in case data was saved directly at root
        const normalized = {
          version: parsed.version || 1,
          backupDate: parsed.backupDate || new Date().toISOString(),
          user: parsed.user || {},
          summary: parsed.summary || {
            transactionsCount: (parsed.data?.transactions || parsed.transactions || []).length,
            investmentsCount: (parsed.data?.investments || parsed.investments || []).length,
            categoriesCount: (parsed.data?.userBudget?.categories || parsed.categories || []).length,
            creditCardsCount: (parsed.data?.userBudget?.creditCards || parsed.creditCards || []).length,
            recurringCount: (parsed.data?.userBudget?.recurringExpenses || parsed.recurringExpenses || []).length,
            investmentAccountsCount: (parsed.data?.userBudget?.investmentAccounts || parsed.investmentAccounts || []).length,
            dcaPlansCount: (parsed.data?.userBudget?.dcaPlans || parsed.dcaPlans || []).length,
          },
          data: {
            transactions: parsed.data?.transactions || parsed.transactions || [],
            investments: parsed.data?.investments || parsed.investments || [],
            userBudget: parsed.data?.userBudget || {
              categories: parsed.categories || [],
              categoryIcons: parsed.categoryIcons || {},
              budgets: parsed.budgets || {},
              creditCards: parsed.creditCards || [],
              recurringExpenses: parsed.recurringExpenses || [],
              investmentAccounts: parsed.investmentAccounts || [],
              dcaPlans: parsed.dcaPlans || [],
            },
            preferences: parsed.data?.preferences || parsed.preferences || {},
          },
        };

        resolve({
          success: true,
          backupData: normalized,
          summary: normalized.summary,
        });
      } catch (err) {
        resolve({ success: false, error: `JSON 解析失敗：${err.message}` });
      }
    };

    reader.onerror = () => {
      resolve({ success: false, error: '讀取檔案時發生錯誤' });
    };

    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Executes the restore process to Firestore with live progress updates.
 * Handles Firestore 500-item batch limitations by chunking operations.
 */
export async function restoreBackupData({ db, user, backupData, mode = 'merge', onProgress }) {
  if (!db || !user || !backupData || !backupData.data) {
    throw new Error('參數無效，無法執行還原');
  }

  const { transactions = [], investments = [], userBudget = {}, preferences = {} } = backupData.data;

  // Report initial progress
  onProgress?.({ percent: 5, status: '正在連線並準備資料庫...' });

  const BATCH_SIZE = 400; // Safe threshold below 500

  // Helper to commit batches in chunks
  const commitOperations = async (ops) => {
    const chunks = [];
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      chunks.push(ops.slice(i, i + BATCH_SIZE));
    }

    for (let c = 0; c < chunks.length; c++) {
      const batch = writeBatch(db);
      for (const op of chunks[c]) {
        op(batch);
      }
      await batch.commit();
    }
  };

  // 1. If OVERWRITE mode, delete existing records first
  if (mode === 'overwrite') {
    onProgress?.({ percent: 15, status: '正在清除現有舊紀錄...' });

    // Fetch existing transactions
    const qTx = query(collection(db, 'transactions'), where('uid', '==', user.uid));
    const txSnaps = await getDocs(qTx);
    const deleteTxOps = txSnaps.docs.map(docSnap => (batch) => batch.delete(docSnap.ref));
    await commitOperations(deleteTxOps);

    // Fetch existing investments
    const qInv = query(collection(db, 'investments'), where('uid', '==', user.uid));
    const invSnaps = await getDocs(qInv);
    const deleteInvOps = invSnaps.docs.map(docSnap => (batch) => batch.delete(docSnap.ref));
    await commitOperations(deleteInvOps);
  }

  onProgress?.({ percent: 35, status: '正在準備寫入交易資料...' });

  // 2. Prepare transactions to write
  let transactionsToWrite = transactions;

  if (mode === 'merge') {
    // If merge mode: query current transactions to avoid duplicate entries
    const qTx = query(collection(db, 'transactions'), where('uid', '==', user.uid));
    const currentTxSnaps = await getDocs(qTx);
    const existingSignatures = new Set(
      currentTxSnaps.docs.map(d => {
        const t = d.data();
        return `${t.date}_${t.type}_${Number(t.amount)}_${t.category}_${(t.description || '').trim()}`;
      })
    );

    transactionsToWrite = transactions.filter(t => {
      const sig = `${t.date}_${t.type}_${Number(t.amount)}_${t.category}_${(t.description || '').trim()}`;
      return !existingSignatures.has(sig);
    });
  }

  // Write transactions in batches
  const txOps = transactionsToWrite.map(t => (batch) => {
    const newDocRef = doc(collection(db, 'transactions'));
    batch.set(newDocRef, {
      ...t,
      uid: user.uid,
      amount: Number(t.amount) || 0,
      createdAt: t.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
  });

  onProgress?.({ percent: 55, status: `正在匯入記帳紀錄 (${transactionsToWrite.length} 筆)...` });
  await commitOperations(txOps);

  // 3. Prepare investments to write
  let investmentsToWrite = investments;

  if (mode === 'merge') {
    const qInv = query(collection(db, 'investments'), where('uid', '==', user.uid));
    const currentInvSnaps = await getDocs(qInv);
    const existingInvSigs = new Set(
      currentInvSnaps.docs.map(d => {
        const inv = d.data();
        return `${inv.date}_${inv.action}_${inv.symbol}_${Number(inv.shares)}_${Number(inv.price)}`;
      })
    );

    investmentsToWrite = investments.filter(inv => {
      const sig = `${inv.date}_${inv.action}_${inv.symbol}_${Number(inv.shares)}_${Number(inv.price)}`;
      return !existingInvSigs.has(sig);
    });
  }

  const invOps = investmentsToWrite.map(inv => (batch) => {
    const newDocRef = doc(collection(db, 'investments'));
    batch.set(newDocRef, {
      ...inv,
      uid: user.uid,
      createdAt: inv.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
  });

  onProgress?.({ percent: 75, status: `正在匯入投資紀錄 (${investmentsToWrite.length} 筆)...` });
  await commitOperations(invOps);

  // 4. Update user settings (categories, icons, cards, recurring, accounts, DCA)
  onProgress?.({ percent: 90, status: '正在更新設定、分類與分帳戶...' });

  const budgetDocRef = doc(db, 'user_budgets', user.uid);

  if (mode === 'overwrite') {
    await setDoc(budgetDocRef, {
      categories: userBudget.categories || [],
      categoryIcons: userBudget.categoryIcons || {},
      budgets: userBudget.budgets || {},
      creditCards: userBudget.creditCards || [],
      recurringExpenses: userBudget.recurringExpenses || [],
      investmentAccounts: userBudget.investmentAccounts || [],
      dcaPlans: userBudget.dcaPlans || [],
    }, { merge: false });
  } else {
    // Merge mode: combine categories, cards, recurring, accounts, dcaPlans
    const currentBudgetSnap = await getDocs(query(collection(db, 'user_budgets'), where('__name__', '==', user.uid)));
    const currentData = currentBudgetSnap.docs[0]?.data() || {};

    const mergedCategories = Array.from(new Set([...(currentData.categories || []), ...(userBudget.categories || [])]));
    const mergedCategoryIcons = { ...(currentData.categoryIcons || {}), ...(userBudget.categoryIcons || {}) };
    const mergedBudgets = { ...(currentData.budgets || {}), ...(userBudget.budgets || {}) };

    // Merge credit cards by name
    const existingCardNames = new Set((currentData.creditCards || []).map(c => c.name));
    const newCards = (userBudget.creditCards || []).filter(c => !existingCardNames.has(c.name));
    const mergedCards = [...(currentData.creditCards || []), ...newCards];

    // Merge recurring expenses by name
    const existingRecNames = new Set((currentData.recurringExpenses || []).map(r => r.name));
    const newRecs = (userBudget.recurringExpenses || []).filter(r => !existingRecNames.has(r.name));
    const mergedRecs = [...(currentData.recurringExpenses || []), ...newRecs];

    // Merge investment accounts by name
    const existingAccNames = new Set((currentData.investmentAccounts || []).map(a => a.name));
    const newAccounts = (userBudget.investmentAccounts || []).filter(a => !existingAccNames.has(a.name));
    const mergedAccounts = [...(currentData.investmentAccounts || []), ...newAccounts];

    // Merge DCA plans by symbol + accountId
    const existingDcaKeys = new Set((currentData.dcaPlans || []).map(p => `${p.symbol}_${p.accountId}_${p.fixedAmount}`));
    const newDcas = (userBudget.dcaPlans || []).filter(p => !existingDcaKeys.has(`${p.symbol}_${p.accountId}_${p.fixedAmount}`));
    const mergedDcas = [...(currentData.dcaPlans || []), ...newDcas];

    await setDoc(budgetDocRef, {
      categories: mergedCategories,
      categoryIcons: mergedCategoryIcons,
      budgets: mergedBudgets,
      creditCards: mergedCards,
      recurringExpenses: mergedRecs,
      investmentAccounts: mergedAccounts,
      dcaPlans: mergedDcas,
    }, { merge: true });
  }

  // 5. Restore local preferences if available
  if (preferences.theme) {
    try {
      localStorage.setItem('theme', preferences.theme);
      document.documentElement.setAttribute('data-theme', preferences.theme);
    } catch (_) {}
  }
  if (preferences.hideAmounts !== undefined) {
    try {
      localStorage.setItem('hideAmounts', String(preferences.hideAmounts));
    } catch (_) {}
  }

  onProgress?.({ percent: 100, status: '備份匯入完成！' });

  return {
    importedTransactions: transactionsToWrite.length,
    importedInvestments: investmentsToWrite.length,
    mode,
  };
}
