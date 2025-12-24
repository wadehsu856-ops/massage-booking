import React, { useState, useMemo, useEffect } from 'react';
import { Clock, User, Users, AlertCircle, CheckCircle, X, Info, Calculator, Phone, Mail, Stethoscope, Save, Lock, Download, LogOut, FileText, Ban, Key, Trash2, Wifi, WifiOff, RefreshCw, Database, AlertTriangle, Send, ThumbsUp, Eraser } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, deleteDoc, doc, getDocs, orderBy, writeBatch } from 'firebase/firestore';

// --- 0. Firebase Configuration & Initialization ---
// ✅ Wade/Shirley 提供的真實金鑰 (V3.3.5 Verified)
const firebaseConfig = {
  apiKey: "AIzaSyBo4bLSOFFFsjHeLjIvcgPlIDkPPNnSSRA",
  authDomain: "massage-appointment-system.firebaseapp.com",
  projectId: "massage-appointment-system",
  storageBucket: "massage-appointment-system.firebasestorage.app",
  messagingSenderId: "204409061498",
  appId: "1:204409061498:web:3f66d734309c3caa3d3bc3",
  measurementId: "G-QEJWWSJLMX"
};

// 初始化 Firebase
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase 初始化失敗:", e);
}

// 系統代號 (統一使用 SYSTEM_ID 避免混淆)
const SYSTEM_ID = "massage_v1"; 

// --- 1. 定義科部與人數資料 (Input Data) ---
const DEPARTMENTS_DATA = [
  { id: 'internal', name: '內科部', count: 33 },
  { id: 'pediatrics', name: '兒科部', count: 5 },
  { id: 'surgery', name: '外科部', count: 8 },
  { id: 'derma', name: '皮膚科', count: 4 },
  { id: 'ent', name: '耳鼻喉科', count: 4 },
  { id: 'urology', name: '泌尿科', count: 5 },
  { id: 'er', name: '急診醫學科', count: 7 },
  { id: 'family', name: '家庭醫學科', count: 8 },
  { id: 'pathology', name: '病理科', count: 1 },
  { id: 'neurosurgery', name: '神經外科', count: 7 },
  { id: 'neurology', name: '神經科', count: 5 },
  { id: 'ortho', name: '骨科部', count: 5 },
  { id: 'obgyn', name: '婦產部', count: 9 },
  { id: 'anesthesiology', name: '麻醉科', count: 6 },
  { id: 'rad_onc', name: '放射腫瘤科', count: 3 },
  { id: 'rehab', name: '復健醫學部', count: 4 },
  { id: 'radiology', name: '影像醫學部', count: 6 },
];

const MASSEURS_COUNT = 2; // 兩位師傅
const ADMIN_PASSWORD = '0510'; // 珮暄密碼

// --- 2. 時間槽生成器 (Time Slot Logic) ---
const generateTimeSlots = () => {
  return [
    // 上午場
    { time: '10:00 - 10:30', duration: 30 },
    { time: '10:30 - 11:00', duration: 30 },
    { time: '11:00 - 11:30', duration: 30 },
    { time: '11:30 - 11:50', duration: 20, isSpecial: true, isForbidden: true }, // 請勿預約

    // 下午場 Block 1
    { time: '13:00 - 13:30', duration: 30 },
    { time: '13:30 - 14:00', duration: 30 },
    { time: '14:00 - 14:30', duration: 30, isForbidden: true }, // V3.3.5 Patch: 鎖定此時段

    // 下午場 Block 2 (從 14:40 開始)
    { time: '14:40 - 15:10', duration: 30 },
    { time: '15:10 - 15:40', duration: 30 },
    { time: '15:40 - 16:10', duration: 30 },
    { time: '16:10 - 16:40', duration: 30 },

    // 下午場 Block 3 (從 16:50 開始)
    { time: '16:50 - 17:20', duration: 30 },
    { time: '17:20 - 17:50', duration: 30 },
  ];
};

const TIME_SLOTS = generateTimeSlots();
const TOTAL_SLOTS = TIME_SLOTS.filter(s => !s.isForbidden).length * MASSEURS_COUNT;

// --- 3. 演算法元件 (Allocation Logic) ---
const useDepartmentAllocation = () => {
  return useMemo(() => {
    const totalPopulation = DEPARTMENTS_DATA.reduce((acc, curr) => acc + curr.count, 0);
    
    let allocation = DEPARTMENTS_DATA.map(dept => ({
      ...dept,
      quota: 1, 
      ratio: dept.count / totalPopulation
    }));

    let usedSlots = allocation.length;
    let remainingSlots = TOTAL_SLOTS - usedSlots; 

    if (remainingSlots < 0) {
      // return { status: 'error', msg: '資源嚴重不足', data: [] };
    }

    const extraAllocation = allocation.map(dept => {
      const idealExtra = (dept.count / totalPopulation) * remainingSlots;
      return {
        ...dept,
        extraInt: Math.floor(idealExtra),
        remainder: idealExtra - Math.floor(idealExtra)
      };
    });

    extraAllocation.forEach(dept => {
      dept.quota += dept.extraInt;
      remainingSlots -= dept.extraInt;
    });

    extraAllocation.sort((a, b) => b.remainder - a.remainder);
    
    for (let i = 0; i < remainingSlots; i++) {
      const targetId = extraAllocation[i].id;
      const targetIndex = allocation.findIndex(d => d.id === targetId);
      if (targetIndex !== -1) {
        allocation[targetIndex].quota += 1;
      }
    }

    allocation.sort((a, b) => b.quota - a.quota);

    return { status: 'success', data: allocation, totalPop: totalPopulation };
  }, []);
};


// --- 4. UI Components ---

const UserInfoForm = ({ userInfo, setUserInfo, departments, allocation, usedMap }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        setUserInfo(prev => ({ ...prev, [name]: value }));
    };

    const selectedDeptInfo = allocation.data.find(d => d.id === userInfo.dept);
    const remaining = selectedDeptInfo ? selectedDeptInfo.quota - (usedMap[userInfo.dept] || 0) : 0;
    const isDeptFull = userInfo.dept && remaining <= 0;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mb-6 relative transition-all">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-4 text-white flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                    <User className="w-5 h-5 text-emerald-400" />
                    基本資料表 (請先填寫以解鎖預約)
                </h3>
                <span className="text-xs bg-white/20 px-2 py-1 rounded">Step 1</span>
            </div>
            
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">姓名 (Name)</label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input 
                            type="text"
                            name="name"
                            value={userInfo.name}
                            onChange={handleChange}
                            placeholder="請輸入全名"
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">科部 (Dept)</label>
                    <div className="relative">
                        <Stethoscope className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <select 
                            name="dept"
                            value={userInfo.dept}
                            onChange={handleChange}
                            className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 outline-none appearance-none bg-white
                                ${isDeptFull ? 'border-red-300 ring-2 ring-red-100 text-red-600' : 'border-slate-300 focus:ring-slate-500 text-slate-800'}
                            `}
                        >
                            <option value="">-- 選擇科部 --</option>
                            {departments.map(d => {
                                const info = allocation.data.find(a => a.id === d.id);
                                const rem = info ? info.quota - (usedMap[d.id] || 0) : 0;
                                const full = rem <= 0;
                                return (
                                    <option key={d.id} value={d.id} disabled={full} className={full ? 'bg-gray-100 text-gray-400' : ''}>
                                        {d.name} {full ? '(額滿)' : `(剩 ${rem})`}
                                    </option>
                                );
                            })}
                        </select>
                        {isDeptFull && (
                            <div className="absolute right-0 top-full mt-1 text-xs text-red-500 font-bold animate-pulse">
                                * 該科名額已滿，請勿選
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">信箱 (Email)</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input 
                            type="email"
                            name="email"
                            value={userInfo.email}
                            onChange={handleChange}
                            placeholder="email@hosp.com"
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">GSM (後四碼)</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input 
                            type="text"
                            name="gsm"
                            value={userInfo.gsm}
                            onChange={handleChange}
                            maxLength={4}
                            placeholder="Ex: 1234"
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 outline-none font-mono"
                        />
                    </div>
                </div>
            </div>
            
            <div className="bg-red-50 px-5 py-3 border-t border-red-100 text-sm font-bold text-red-600 flex items-center justify-center">
                <Info className="w-5 h-5 mr-2 text-red-600" />
                若要取消，請聯繫教學部珮暄 (分機 3751)
            </div>
        </div>
    );
};

const QuotaTable = ({ allocation, usedMap }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className="bg-slate-100 p-3 flex justify-between items-center border-b border-slate-200">
        <h3 className="font-bold flex items-center gap-2 text-slate-700 text-sm">
          <Calculator className="w-4 h-4 text-slate-400" />
          科部配額 (即時扣除)
        </h3>
        <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600 font-mono">
           可預約名額: {TOTAL_SLOTS} (11:30除外)
        </span>
      </div>
      
      <div className="overflow-x-auto max-h-60 overflow-y-auto">
        <table className="w-full text-xs text-left relative">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2">科部</th>
              <th className="px-4 py-2 text-center">總額</th>
              <th className="px-4 py-2 text-center">剩餘</th>
              <th className="px-4 py-2 text-center text-slate-300">人數</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allocation.data.map((dept) => {
              const used = usedMap[dept.id] || 0;
              const remaining = dept.quota - used;
              const isFull = remaining <= 0;
              
              return (
                <tr key={dept.id} className={`hover:bg-slate-50 transition-colors ${isFull ? 'bg-slate-50' : ''}`}>
                  <td className={`px-4 py-2 font-medium ${isFull ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{dept.name}</td>
                  <td className={`px-4 py-2 text-center font-bold ${isFull ? 'text-slate-400' : 'text-slate-700'}`}>{dept.quota}</td>
                  <td className={`px-4 py-2 text-center font-bold ${remaining === 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {remaining === 0 ? '額滿' : remaining}
                  </td>
                  <td className="px-4 py-2 text-center text-slate-300 font-mono">{dept.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const LoginModal = ({ isOpen, onClose, onLogin }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            onLogin();
            setPassword('');
            setError('');
        } else {
            setError('密碼錯誤 (Hint: 0510)');
            setPassword('');
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden ring-1 ring-slate-200">
                <div className="bg-slate-800 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2 text-sm">
                        <Lock className="w-4 h-4" />
                        珮暄權限驗證
                    </h3>
                    <button onClick={onClose} className="hover:bg-slate-700 p-1 rounded-full"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Password</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input 
                                type="password"
                                autoFocus
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-600 outline-none"
                                placeholder="請輸入珮暄密碼"
                            />
                        </div>
                    </div>
                    {error && (
                        <div className="mb-4 text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100 flex items-center">
                            <AlertCircle className="w-3 h-3 mr-1" /> {error}
                        </div>
                    )}
                    <button 
                        type="submit"
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg transition-all text-sm"
                    >
                        登入 (Login)
                    </button>
                </form>
            </div>
        </div>
    );
};

const ConfirmModal = ({ isOpen, onClose, slot, onConfirm, userInfo, deptName, isProcessing }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden ring-1 ring-slate-200 border-t-4 border-emerald-500">
        <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2 text-slate-800">
                <FileText className="w-5 h-5 text-emerald-600" />
                預約確認詳單
            </h3>
            <button onClick={onClose} disabled={isProcessing} className="hover:bg-gray-200 p-1 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        
        <div className="p-6 space-y-5">
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                <p className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1">預約時段 (Time Slot)</p>
                <p className="text-2xl font-black text-emerald-800 font-mono tracking-tight">{slot.time}</p>
                <p className="text-xs text-emerald-600 mt-1">({slot.duration} min)</p>
            </div>
            
            <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2 border-dashed">
                    <span className="text-gray-500 flex items-center"><User className="w-4 h-4 mr-2"/> 姓名</span>
                    <span className="font-bold text-gray-800">{userInfo.name}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2 border-dashed">
                    <span className="text-gray-500 flex items-center"><Stethoscope className="w-4 h-4 mr-2"/> 科部</span>
                    <span className="font-bold text-gray-800">{deptName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2 border-dashed">
                    <span className="text-gray-500 flex items-center"><Mail className="w-4 h-4 mr-2"/> 信箱</span>
                    <span className="font-bold text-gray-800 truncate max-w-[180px]">{userInfo.email}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2 border-dashed">
                    <span className="text-gray-500 flex items-center"><Phone className="w-4 h-4 mr-2"/> GSM</span>
                    <span className="font-bold text-gray-800 font-mono">***{userInfo.gsm}</span>
                </div>
            </div>

            <div className="pt-2">
                <p className="text-center text-xs text-red-500 font-bold mb-3 animate-pulse">
                    ⚠ 確認完畢請按送出鍵
                </p>
                <button 
                    onClick={onConfirm}
                    disabled={isProcessing}
                    className={`w-full text-white font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center text-base
                        ${isProcessing ? 'bg-gray-400 cursor-wait' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl active:scale-95'}
                    `}
                >
                    {isProcessing ? (
                        <span className="flex items-center"><RefreshCw className="w-4 h-4 mr-2 animate-spin"/> 資料寫入中...</span>
                    ) : (
                        <span className="flex items-center"><Send className="w-4 h-4 mr-2"/> 確認送出 (Submit)</span>
                    )}
                </button>
            </div>
            
            <div className="text-center text-sm font-bold text-red-600 mt-4">
                若需取消，請聯繫教學部珮暄 (分機 3751)
            </div>
        </div>
      </div>
    </div>
  );
};

const SuccessModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden ring-4 ring-emerald-100 p-8 text-center relative">
                
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                
                <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce shadow-sm">
                    <CheckCircle className="w-10 h-10" />
                </div>
                
                <h3 className="text-2xl font-black text-slate-800 mb-2">您已成功預約！</h3>
                <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                    系統已成功寫入您的資料。<br/>
                    請記得準時前往 <span className="font-bold text-emerald-600">26 病房</span> 享受按摩。
                </p>
                
                <div className="bg-red-50 p-3 rounded-lg text-sm text-red-600 font-bold mb-6 border border-red-100">
                    若需取消，請聯繫教學部珮暄 (分機 3751)
                </div>
                
                <button 
                    onClick={onClose}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-emerald-200/50 transition-all active:scale-95 flex items-center justify-center"
                >
                    <ThumbsUp className="w-5 h-5 mr-2" />
                    太棒了 (Awesome)
                </button>
            </div>
        </div>
    );
};

// V3.3.2 Fix: Delete Confirm Modal
const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, isClearing, mode, targetName }) => {
    if (!isOpen) return null;
    
    const isSingle = mode === 'single';
    const title = isSingle ? "刪除確認" : "紅色警戒：清除資料";
    const mainText = isSingle ? `確定要刪除 [${targetName}] 的預約嗎？` : "確定要清空所有資料嗎？";
    const subText = isSingle 
        ? "刪除後名額將會釋出，無法復原。" 
        : (<span>此操作將會移除所有住院醫師的預約紀錄，且<span className="font-bold text-red-600">無法復原</span>。</span>);
    const confirmBtnText = isSingle ? "確認刪除 (Delete)" : "確認清空 (Delete All)";
    const headerColor = isSingle ? "bg-orange-500" : "bg-red-600";
    const hoverBtnColor = isSingle ? "hover:bg-orange-600" : "hover:bg-red-700";
    const btnColor = isSingle ? "bg-orange-500" : "bg-red-600";
    const iconColor = isSingle ? "text-orange-500" : "text-red-600";
    const ringColor = isSingle ? "ring-orange-100" : "ring-red-100";
    const iconBg = isSingle ? "bg-orange-100" : "bg-red-100";

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in duration-200">
            <div className={`bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden ring-4 ${ringColor}`}>
                <div className={`${headerColor} p-4 text-white flex justify-between items-center`}>
                    <h3 className="font-bold flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-5 h-5" />
                        {title}
                    </h3>
                    <button onClick={onClose} disabled={isClearing} className={`hover:bg-black/20 p-1 rounded-full`}><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6">
                    <div className="text-center mb-6">
                        <div className={`w-16 h-16 ${iconBg} rounded-full flex items-center justify-center mx-auto mb-4 ${iconColor}`}>
                            <Trash2 className="w-8 h-8" />
                        </div>
                        <h4 className="text-lg font-bold text-gray-800 mb-2">{mainText}</h4>
                        <p className="text-sm text-gray-500">
                            {subText}
                        </p>
                    </div>
                    
                    <div className="flex gap-3">
                        <button 
                            onClick={onClose}
                            disabled={isClearing}
                            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
                        >
                            取消 (Cancel)
                        </button>
                        <button 
                            onClick={onConfirm}
                            disabled={isClearing}
                            className={`flex-1 py-2.5 ${btnColor} ${hoverBtnColor} text-white rounded-lg font-bold text-sm shadow-md hover:shadow-lg transition-all flex justify-center items-center`}
                        >
                            {isClearing ? '處理中...' : confirmBtnText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// V3.3.5 Fix: Add missing onDeleteRow prop
const AdminDashboard = ({ bookings, onClose, departments, onClearData, user, onDeleteRow }) => {
    const [deleteTarget, setDeleteTarget] = useState(null); 
    const [isClearing, setIsClearing] = useState(false);

    const bookingsList = useMemo(() => {
        return Object.entries(bookings).reduce((acc, [time, users]) => {
            return acc.concat(users.map(u => ({...u, time})));
        }, []).sort((a, b) => a.time.localeCompare(b.time));
    }, [bookings]);

    const handleDownloadCSV = () => {
        const headers = ['時段,姓名,科部,Email,GSM'];
        const rows = bookingsList.map(b => {
            const deptName = departments.find(d => d.id === b.dept)?.name || b.dept;
            return `${b.time},${b.name},${deptName},${b.email},'${b.gsm}`; 
        });
        
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `massage_bookings_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleClearAllClick = () => {
        setDeleteTarget({ type: 'all' });
    }

    const handleRowDeleteClick = (docId, name) => {
        if (!docId) {
            alert("錯誤：資料 ID 遺失");
            return;
        }
        setDeleteTarget({ type: 'single', id: docId, name: name });
    }

    const handleExecuteDelete = async () => {
        if (!deleteTarget) return;

        setIsClearing(true);
        if (deleteTarget.type === 'all') {
             await onClearData();
        } else if (deleteTarget.type === 'single') {
             await onDeleteRow(deleteTarget.id);
        }
        setIsClearing(false);
        setDeleteTarget(null);
    }

    return (
        <div className="fixed inset-0 bg-white z-50 overflow-auto animate-in fade-in slide-in-from-bottom-10 duration-300">
            <div className="max-w-6xl mx-auto p-6">
                <div className="flex justify-between items-center mb-8 border-b pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Lock className="w-6 h-6 text-slate-800" />
                            珮暄的後台 (Admin Dashboard)
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-slate-500 text-sm">掌握全院按摩動態，匯出名單交差</p>
                            {/* V3.3.5: Use SYSTEM_ID */}
                            <span className="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded border border-slate-200">
                                App ID: {SYSTEM_ID.substring(0, 8)}...
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={handleClearAllClick}
                            className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> 清空所有資料
                        </button>
                        <button 
                            onClick={handleDownloadCSV}
                            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow"
                        >
                            <Download className="w-4 h-4" /> 匯出 CSV (Excel)
                        </button>
                        <button 
                            onClick={onClose}
                            className="flex items-center gap-2 bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors"
                        >
                            <LogOut className="w-4 h-4" /> 登出/返回
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                        <p className="text-blue-600 font-bold text-sm uppercase">總預約人數</p>
                        <p className="text-4xl font-bold text-blue-900 mt-2">{bookingsList.length}</p>
                        <p className="text-xs text-blue-400 mt-1 flex items-center">
                            <Wifi className="w-3 h-3 mr-1" /> Cloud Sync Active
                        </p>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100">
                        <p className="text-emerald-600 font-bold text-sm uppercase">剩餘名額</p>
                        <p className="text-4xl font-bold text-emerald-900 mt-2">{Math.max(0, TOTAL_SLOTS - bookingsList.length)}</p>
                    </div>
                    <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                        <p className="text-purple-600 font-bold text-sm uppercase">熱門科部</p>
                        <p className="text-xl font-bold text-purple-900 mt-2 truncate">
                            {/* Safer reduction logic */}
                            {Object.entries(bookingsList.reduce((acc, curr) => {
                                acc[curr.dept] = (acc[curr.dept] || 0) + 1;
                                return acc;
                            }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] 
                                ? departments.find(d => d.id === Object.entries(bookingsList.reduce((acc, curr) => {
                                    acc[curr.dept] = (acc[curr.dept] || 0) + 1;
                                    return acc;
                                }, {})).sort((a, b) => b[1] - a[1])[0][0])?.name
                                : '尚無資料'}
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> 預約明細列表
                        </h3>
                        <span className="text-xs text-slate-400 font-mono">
                            Memory: {JSON.stringify(bookings).length} bytes
                        </span>
                    </div>
                    {bookingsList.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                            <Database className="w-12 h-12 text-slate-200 mb-2" />
                            <p>目前還沒有人預約，可能大家都去跑 Code Blue 了。</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-500 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-3">預約時段</th>
                                        <th className="px-6 py-3">姓名</th>
                                        <th className="px-6 py-3">科部</th>
                                        <th className="px-6 py-3">Email</th>
                                        <th className="px-6 py-3">GSM</th>
                                        <th className="px-6 py-3 text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {bookingsList.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 group">
                                            <td className="px-6 py-4 font-mono font-bold text-slate-700">{row.time}</td>
                                            <td className="px-6 py-4 font-medium text-slate-900">{row.name}</td>
                                            <td className="px-6 py-4">
                                                <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs">
                                                    {departments.find(d => d.id === row.dept)?.name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">{row.email}</td>
                                            <td className="px-6 py-4 font-mono text-slate-500">***{row.gsm}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleRowDeleteClick(row.id, row.name)}
                                                    className="text-slate-400 hover:text-white hover:bg-orange-500 p-2 rounded-full transition-all"
                                                    title="刪除此筆資料"
                                                >
                                                    <Eraser className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <DeleteConfirmModal 
                isOpen={!!deleteTarget} 
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleExecuteDelete}
                isClearing={isClearing}
                mode={deleteTarget?.type}
                targetName={deleteTarget?.name}
            />
        </div>
    );
};


// --- 5. Main Application ---
const MassageBookingSystem = () => {
  const allocation = useDepartmentAllocation();
  
  // States
  const [userInfo, setUserInfo] = useState({ name: '', dept: '', email: '', gsm: '' });
  const [user, setUser] = useState(null); 
  const [isProcessing, setIsProcessing] = useState(false); 
  
  // Real-time Bookings State (From Firestore)
  const [bookings, setBookings] = useState({}); 

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [formError, setFormError] = useState('');
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  
  // Admin State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // --- Firebase Logic ---
  
  // 1. Auth Initialization
  useEffect(() => {
    if (typeof firebaseConfig === 'undefined') return;

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth Error:", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Sync (Firestore -> Local State)
  useEffect(() => {
    if (!user || !db) return;

    const q = collection(db, 'bookings');
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const newBookings = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            const slotId = data.slotId;
            // V3.3.0 Important: Inject Doc ID for deletion
            const bookingData = { ...data, id: doc.id };

            if (slotId) { 
                if (!newBookings[slotId]) {
                    newBookings[slotId] = [];
                }
                newBookings[slotId].push(bookingData);
            }
        });
        setBookings(newBookings);
    }, (error) => {
        console.error("Firestore sync error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Used Quota Calculation (Derived from bookings)
  const usedQuotaMap = useMemo(() => {
    const map = {};
    const allRecords = Object.values(bookings).reduce((acc, val) => acc.concat(val), []);
    
    allRecords.forEach(record => {
      if (record && record.dept) {
          map[record.dept] = (map[record.dept] || 0) + 1;
      }
    });
    return map;
  }, [bookings]);

  // V3.3.0 Feature: Check Duplicate (Client-side)
  const checkDuplicate = () => {
      const allRecords = Object.values(bookings).reduce((acc, val) => acc.concat(val), []);
      
      const isNameDup = allRecords.some(b => b.name === userInfo.name);
      if (isNameDup) return `姓名 [${userInfo.name}] 已經預約過了，請勿貪心！`;

      const isEmailDup = allRecords.some(b => b.email === userInfo.email);
      if (isEmailDup) return `信箱 [${userInfo.email}] 已經使用過了！`;

      const isGsmDup = allRecords.some(b => b.gsm === userInfo.gsm);
      if (isGsmDup) return `GSM 後四碼 [${userInfo.gsm}] 已經登記過了！`;

      return null;
  };

  const validateUserInfo = () => {
    if (!userInfo.name) return '請填寫姓名';
    if (!userInfo.dept) return '請選擇科部';
    if (!userInfo.email) return '請填寫信箱';
    if (!userInfo.gsm || !/^\d{4}$/.test(userInfo.gsm)) return 'GSM 請填寫後四碼數字';
    
    // Check quota logic
    const deptQuota = allocation.data.find(d => d.id === userInfo.dept)?.quota || 0;
    const deptUsed = usedQuotaMap[userInfo.dept] || 0;
    if (deptUsed >= deptQuota) return `該科部 (${DEPARTMENTS_DATA.find(d=>d.id===userInfo.dept)?.name}) 名額已滿，請勿強行闖關`;

    return null;
  };

  const handleSlotClick = (slot) => {
    setFormError('');
    
    if (slot.isForbidden) return; 

    const currentBookings = bookings[slot.time] || [];
    if (currentBookings.length >= MASSEURS_COUNT) return; 

    // 1. Basic Validation
    const error = validateUserInfo();
    if (error) {
        setFormError(error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    // 2. V3.3.0 Feature: Duplicate Check
    const dupError = checkDuplicate();
    if (dupError) {
        setFormError(dupError);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    
    setSelectedSlot(slot);
    setModalOpen(true);
  };

  const handleConfirmBooking = async () => {
    if (!user) {
        alert("尚未連線到伺服器 (Firebase未配置或連線中)，請檢查 Config。");
        return;
    }
    setIsProcessing(true);

    try {
        // Double check duplicate before write (in case of race condition)
        const dupError = checkDuplicate();
        if (dupError) {
            alert(dupError);
            setIsProcessing(false);
            return;
        }

        await addDoc(collection(db, 'bookings'), {
            ...userInfo,
            slotId: selectedSlot.time,
            timestamp: new Date().toISOString()
        });
        
        setModalOpen(false);
        setSuccessModalOpen(true); 
    } catch (e) {
        console.error("Booking failed:", e);
        const errorCode = e.code || e.message;
        if (errorCode.includes("permission-denied")) {
            alert("權限不足！請去 Firebase Console -> Firestore Database -> Rules 頁面，把規則改成 `allow read, write: if true;`");
        } else {
            alert(`預約失敗！錯誤代碼：${errorCode}`);
        }
    } finally {
        setIsProcessing(false);
    }
  };

  // V3.3.2: Single Row Delete Handler
  const handleDeleteRow = async (docId) => {
      try {
          await deleteDoc(doc(db, 'bookings', docId));
      } catch (e) {
          console.error("Error deleting document:", e);
          alert(`刪除失敗：${e.message}`);
      }
  }

  const handleClearData = async () => {
      if (!user) return;
      try {
        const q = collection(db, 'bookings');
        const snapshot = await getDocs(q);
        
        const deletePromises = [];
        snapshot.forEach((document) => {
            deletePromises.push(deleteDoc(doc(db, 'bookings', document.id)));
        });
        
        await Promise.all(deletePromises);
        console.log("All data cleared successfully");
      } catch (e) {
          console.error("Error clearing data:", e);
          alert(`清空失敗：${e.message}`);
      }
  }

  const handleAdminClick = () => {
      setLoginModalOpen(true);
  };

  const handleLoginSuccess = () => {
      setLoginModalOpen(false);
      setIsAdminOpen(true);
  };

  // Render Admin Dashboard
  if (isAdminOpen) {
      return (
        <AdminDashboard 
            bookings={bookings} 
            onClose={() => setIsAdminOpen(false)} 
            departments={DEPARTMENTS_DATA}
            onClearData={handleClearData}
            onDeleteRow={handleDeleteRow} // V3.3.5 Fix: Pass down the missing prop
            user={user}
        />
      );
  }

  // Helper for Step 2 display
  const selectedDeptInfo = userInfo.dept ? allocation.data.find(d => d.id === userInfo.dept) : null;
  const currentDeptUsed = userInfo.dept ? (usedQuotaMap[userInfo.dept] || 0) : 0;
  const currentDeptRemaining = selectedDeptInfo ? Math.max(0, selectedDeptInfo.quota - currentDeptUsed) : 0;
  const isSelectedDeptFull = userInfo.dept && currentDeptRemaining <= 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-white shadow-lg relative">
                <Users className="w-6 h-6" />
                {/* Connection Status Dot */}
                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${user ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
             </div>
             <div>
               <h1 className="text-xl font-bold text-slate-800 leading-tight">住院醫師按摩預約系統 <span className="text-xs text-white bg-emerald-600 px-1.5 py-0.5 rounded ml-1">V3.3.5</span></h1>
               <p className="text-xs text-slate-500 flex items-center">
                   {user ? <span className="text-emerald-600 flex items-center"><Wifi className="w-3 h-3 mr-1"/> 雲端已連線</span> : <span className="text-red-500 flex items-center"><WifiOff className="w-3 h-3 mr-1"/> 連線中斷</span>}
                   <span className="mx-2">|</span> 
                   即時同步，手速要快
               </p>
             </div>
          </div>
          
          {/* Admin Toggle - Now uses handleAdminClick */}
          <button 
            onClick={handleAdminClick}
            className="text-xs text-slate-400 hover:text-slate-800 border border-transparent hover:border-slate-300 px-3 py-1 rounded-full transition-all"
          >
            珮暄登入
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        
        {/* Error Message Toast */}
        {formError && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-md animate-bounce">
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    <p className="font-bold">{formError}</p>
                </div>
            </div>
        )}

        {/* 1. User Info Form (Step 1) */}
        <UserInfoForm 
            userInfo={userInfo} 
            setUserInfo={setUserInfo} 
            departments={DEPARTMENTS_DATA}
            allocation={allocation}
            usedMap={usedQuotaMap}
        />

        {/* Rules Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 text-sm text-slate-600 shadow-sm">
           <Info className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
           <div>
             <h3 className="font-bold mb-1 text-base text-slate-800">登記說明</h3>
             <ul className="list-decimal pl-4 space-y-1">
               <li><span className="font-bold text-sm">按摩日期請詳見信件時間</span></li>
               <li>每一時段為 30 分鐘，但按摩時間為 20 分鐘，保留 10 分鐘時間給你們衝刺到 26 病房。</li>
               <li>按摩地點在 26 病房 (第二醫療大樓 6 樓)。</li>
               <li><span className="font-bold text-red-500">11:30 - 11:50 該時段請勿預約。</span></li>
               <li>如有任何疑問，請聯繫教學部珮暄 (分機 3751) 。</li>
             </ul>
           </div>
        </div>

        {/* Quota Table */}
        <QuotaTable allocation={allocation} usedMap={usedQuotaMap} />

        {/* Booking Grid (Step 2) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Step 2: 點擊預約時段
            </h2>
            
            {/* Status Indicator for Step 2 */}
            <div className="flex items-center">
                {userInfo.dept ? (
                    <div className={`text-xs px-3 py-1.5 rounded-full border flex items-center font-bold shadow-sm transition-all
                        ${isSelectedDeptFull 
                            ? 'bg-red-100 border-red-200 text-red-700' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'}
                    `}>
                        <span className="mr-1">{selectedDeptInfo?.name}:</span>
                        {isSelectedDeptFull ? (
                            <span className="flex items-center"><Ban className="w-3 h-3 mr-1"/> 額滿</span>
                        ) : (
                            <span className="flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> 剩餘 {currentDeptRemaining} 名額</span>
                        )}
                    </div>
                ) : (
                    <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                        請先完成 Step 1 選擇科部
                    </span>
                )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TIME_SLOTS.map((slot, idx) => {
              const currentBookings = bookings[slot.time] || [];
              const isFull = currentBookings.length >= MASSEURS_COUNT;
              const availableCount = MASSEURS_COUNT - currentBookings.length;
              
              // 處理 forbidden 狀態的樣式
              if (slot.isForbidden) {
                 return (
                    <div 
                      key={idx}
                      className="relative border rounded-lg p-3 bg-gray-100 border-gray-200 opacity-60 flex flex-col items-center justify-center cursor-not-allowed min-h-[110px]"
                    >
                         <div className="text-center">
                            <span className="font-mono font-bold text-lg text-gray-400 block mb-1">
                                {slot.time.split('-')[0]} 
                                <span className="text-xs font-normal mx-1">to</span>
                                {slot.time.split('-')[1]}
                            </span>
                            <div className="flex items-center justify-center text-red-500 font-bold text-sm bg-red-50 px-3 py-1 rounded-full border border-red-100 mt-2">
                                <Ban className="w-3 h-3 mr-1" /> 請勿預約
                            </div>
                         </div>
                    </div>
                 )
              }

              return (
                <div 
                  key={idx}
                  onClick={() => !isSelectedDeptFull && !isFull && handleSlotClick(slot)}
                  className={`
                    relative border rounded-lg p-3 transition-all duration-200
                    ${isFull || isSelectedDeptFull
                      ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-80' 
                      : 'bg-white border-slate-200 hover:border-emerald-400 hover:ring-1 hover:ring-emerald-400 hover:shadow-md cursor-pointer hover:-translate-y-1 group'}
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`font-mono font-bold text-lg ${isFull ? 'text-slate-400' : 'text-slate-700'}`}>
                      {slot.time.split('-')[0]} 
                      <span className="text-xs font-normal text-slate-400 mx-1">to</span>
                      {slot.time.split('-')[1]}
                    </span>
                    {slot.isSpecial && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                        20m
                      </span>
                    )}
                  </div>

                  {/* Capacity Indicator */}
                  <div className="flex items-center gap-1 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFull ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isFull ? '額滿' : `時段剩 ${availableCount} 位`}
                      </span>
                  </div>

                  {/* Booked Users List */}
                  <div className="space-y-1 min-h-[40px]">
                    {currentBookings.map((b, i) => (
                      <div key={i} className="flex items-center text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm truncate">
                        <User className="w-3 h-3 mr-1 text-slate-400" />
                        <span className="truncate max-w-[80px] font-medium">{b.name}</span>
                        <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1 rounded">
                            {DEPARTMENTS_DATA.find(d=>d.id===b.dept)?.name.substring(0,2)}
                        </span>
                      </div>
                    ))}
                    {!isFull && (
                        <div className={`text-xs flex items-center justify-center h-6 border border-dashed rounded transition-opacity font-bold mt-1
                            ${isSelectedDeptFull 
                                ? 'border-red-200 text-red-400 bg-red-50 cursor-not-allowed' 
                                : 'border-emerald-200 text-emerald-500 opacity-0 group-hover:opacity-100'}
                        `}>
                            {isSelectedDeptFull ? '額滿' : '+ 立即預約'}
                        </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <ConfirmModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        slot={selectedSlot}
        onConfirm={handleConfirmBooking}
        userInfo={userInfo}
        deptName={DEPARTMENTS_DATA.find(d => d.id === userInfo.dept)?.name}
        isProcessing={isProcessing}
      />

      <SuccessModal
        isOpen={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
      />

      <LoginModal 
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLogin={handleLoginSuccess}
      />
      
      <footer className="text-center text-slate-400 text-xs py-4">
        Designed by Wade (X86 Engineer) - Cloud-Native Architecture, High Availability.
      </footer>
    </div>
  );
};

export default MassageBookingSystem;