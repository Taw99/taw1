import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, onSnapshot, query, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- SheetJS for Excel Export ---
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.mjs';

// --- Configuration ---
const CONFIG = {
    firebase: {
        apiKey: "AIzaSyC26fXDiuJM1FpMkz0xi_Beb0L7nF7Wj7Y", 
        authDomain: "egy-v-1376c.firebaseapp.com",
        projectId: "egy-v-1376c",
        storageBucket: "egy-v-1376c.appspot.com",
        messagingSenderId: "963221682469",
        appId: "1:963221682469:web:f512e3acac4ef8c71742cc"
    },
    users: []
};

// Generate Users Locally
for(let i=1; i<=3; i++) CONFIG.users.push({ id: `mgr_0${i}`, username: `مدير${i}`, password: '123', role: 'manager', displayName: `المدير ${i}` });
for(let i=1; i<=12; i++) CONFIG.users.push({ id: `emp_${String(i).padStart(2,'0')}`, username: `موظف${i}`, password: '123', role: 'employee', displayName: `الموظف ${i}` });

const APP_ID = CONFIG.firebase.projectId;

// --- App State ---
const state = {
    currentUser: null,
    fbUser: null,
    tasks: [],
    leaves: [],
    employeesData: {},
    balanceLogs: [],
    overtimeLogs: [],
    currentPage: '',
    compressedImage: null,
    isFirebaseReady: false
};

// --- Services ---
const fb = {
    app: null,
    db: null,
    auth: null,
    storage: null,
    init() {
        try {
            this.app = initializeApp(CONFIG.firebase);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            this.storage = getStorage(this.app);
            state.isFirebaseReady = true;
            console.log("Firebase Initialized Successfully");
        } catch (error) {
            console.error("Firebase Initialization Error", error);
            utils.toast("خطأ في الاتصال بقاعدة البيانات", "error");
        }
    }
};

// --- Helpers ---
const utils = {
    $: id => document.getElementById(id),
    show: id => { if(utils.$(id)) utils.$(id).classList.remove('hidden') },
    hide: id => { if(utils.$(id)) utils.$(id).classList.add('hidden') },
    toast: (msg, type = 'success') => { 
        const c = utils.$('toast-container'); 
        if(!c) return;
        const t = document.createElement('div'); 
        t.className = `pointer-events-auto px-4 py-2 rounded-xl shadow-lg text-white text-sm font-medium mb-2 ${type === 'success' ? 'bg-teal-500' : 'bg-red-400'} fade-in`; 
        t.textContent = msg; 
        c.appendChild(t); 
        setTimeout(() => t.remove(), 3000);
    },
    formatDate: (d) => {
        if (!d) return '-'; 
        const date = d.toDate ? d.toDate() : new Date(d); 
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    },
    compressImage: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const SIZE = 512;
                    canvas.width = SIZE;
                    canvas.height = SIZE;
                    const ctx = canvas.getContext('2d');
                    const scale = Math.max(SIZE / img.width, SIZE / img.height);
                    const x = (SIZE / 2) - (img.width / 2) * scale;
                    const y = (SIZE / 2) - (img.height / 2) * scale;
                    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = reject;
            };
            reader.readAsDataURL(file);
        });
    }
};

// --- UI Management ---
const UI = {
    toggleSidebar: () => {
        utils.$('sidebar-panel').classList.toggle('active');
        utils.$('sidebar-backdrop').classList.toggle('active');
    },
    openModal: () => {
        utils.$('modal-container').classList.add('active');
        document.body.style.overflow = 'hidden';
    },
    closeModal: () => {
        utils.$('modal-container').classList.remove('active');
        document.body.style.overflow = '';
    },
    setAppIcon: (url) => {
        if(!url) return;
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/png'; link.rel = 'icon'; link.href = url;
        document.getElementsByTagName('head')[0].appendChild(link);
        utils.toast("تم تحديث أيقونة التطبيق!");
    },
    closeViewer: () => utils.$('image-viewer').classList.remove('active'),
    viewImage: (url) => {
        if(!url) return;
        utils.$('viewer-img').src = url;
        utils.$('image-viewer').classList.add('active');
    },
    renderSidebar: () => {
        if(!state.currentUser) return;
        const u = state.currentUser;
        utils.$('sidebar-panel').innerHTML = `
        <div class="flex flex-col h-full">
            <div class="p-6 bg-gradient-to-br from-teal-600 to-teal-800 text-white rounded-tr-3xl relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-full bg-black/10"></div>
                <div class="relative z-10">
                    <div class="flex justify-between items-start mb-4">
                        <div class="bg-white/20 p-2 rounded-xl backdrop-blur-sm border border-white/10">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        </div>
                        <button onclick="App.UI.toggleSidebar()" class="hover:bg-white/20 p-1 rounded-full transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <h2 class="text-xl font-bold">${u.displayName}</h2>
                    <p class="text-sm text-teal-100 mt-1">${u.role === 'manager' ? 'صلاحية المدير' : 'صلاحية الموظف'}</p>
                </div>
            </div>
            <nav class="flex-1 p-4 space-y-1 overflow-y-auto" id="menu-items"></nav>
            <div class="p-4 border-t border-gray-100">
                <button onclick="App.Auth.logout()" class="w-full flex items-center justify-center gap-2 py-2.5 text-red-500 hover:bg-red-50 rounded-xl transition font-semibold">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    <span>تسجيل الخروج</span>
                </button>
            </div>
        </div>`;
        
        const menu = utils.$('menu-items');
        const addItem = (id, label, icon, color) => {
            const btn = document.createElement('button');
            btn.className = `w-full text-right p-3 rounded-xl flex items-center gap-3 transition ${state.currentPage === id ? `bg-teal-50 text-teal-600 font-bold` : 'hover:bg-gray-50 text-gray-600'}`;
            btn.innerHTML = `<svg class="w-5 h-5 ${state.currentPage === id ? color : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"></path></svg><span>${label}</span>`;
            btn.onclick = () => { Navigation.go(id); UI.toggleSidebar(); };
            menu.appendChild(btn);
        };

        if (u.role === 'manager') {
            addItem('tasks', 'المهام', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', 'text-teal-500');
            addItem('leaves', 'الإجازات', 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', 'text-orange-500');
            addItem('mgr-balance', 'الأرصدة', 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', 'text-blue-500');
            addItem('mgr-logs', 'السجل والتصدير', 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', 'text-purple-500');
        } else {
            addItem('emp-balance', 'رصيدي', 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0 0V4a2 2 0 114 0v1M4 7h16M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7', 'text-green-500');
            addItem('tasks', 'مهامي', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', 'text-teal-500');
            addItem('leaves', 'إجازاتي', 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', 'text-orange-500');
            addItem('overtime', 'الوقت الإضافي', 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', 'text-indigo-500');
        }
    }
};

// --- Navigation ---
const Navigation = {
    go: (pageId) => {
        state.currentPage = pageId;
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        let page = utils.$(`page-${pageId}`);
        if (!page) {
            const container = utils.$('dashboard-container');
            page = document.createElement('div');
            page.id = `page-${pageId}`;
            page.className = 'page slide-up';
            container.appendChild(page);
        }
        page.classList.remove('hidden');
        UI.renderSidebar();
        Renderer.update();
    }
};

// --- Renderer ---
const Renderer = {
    update: () => {
        if (!state.currentUser) return;
        const u = state.currentUser;
        const d = state.employeesData[u.id] || {};
        
        if (u.role === 'employee') {
            utils.$('header-balance').textContent = `${d.balanceDays || 0} ي`;
            utils.show('header-balance');
        } else {
            utils.hide('header-balance');
        }

        const pageContent = Pages[state.currentPage];
        if (pageContent) {
            utils.$(`page-${state.currentPage}`).innerHTML = pageContent();
        }
    }
};

// --- Pages Templates ---
const Pages = {
    'emp-balance': () => {
        const d = state.employeesData[state.currentUser.id] || {};
        return `
        <div class="card overflow-hidden">
            <div class="bg-gradient-to-br from-teal-500 to-teal-700 p-8 text-white relative overflow-hidden">
                <div class="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                <div class="relative z-10">
                    <p class="text-teal-100 text-sm font-medium mb-2">رصيدك الحالي</p>
                    <div class="flex items-end gap-4">
                        <div class="flex items-baseline gap-1">
                            <span class="text-6xl font-extrabold tracking-tight">${d.balanceDays || 0}</span>
                            <span class="text-xl text-teal-200 mb-1">يوم</span>
                        </div>
                        <div class="bg-white/20 px-4 py-1.5 rounded-full backdrop-blur-sm mb-1">
                            <span class="font-bold">${d.balanceHours || 0}</span>
                            <span class="text-xs text-teal-100">ساعة</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    },
    'mgr-balance': () => {
        return `
        <div class="card overflow-hidden">
            <div class="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <h3 class="font-bold text-gray-800 text-lg">إدارة الأرصدة</h3>
            </div>
            <div class="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
                ${CONFIG.users.filter(u=>u.role==='employee').map(u => {
                    const d = state.employeesData[u.id] || {};
                    return `
                    <div class="flex justify-between items-center p-4 hover:bg-gray-50/50 transition-colors duration-200">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-md">${u.displayName.split(' ')[1]}</div>
                            <div><p class="font-semibold text-gray-800">${u.displayName}</p></div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-center bg-gray-50 px-3 py-1 rounded-lg">
                                <span class="font-bold text-teal-600 text-lg">${d.balanceDays || 0}</span>
                                <span class="text-[10px] text-gray-400 block -mt-1">يوم</span>
                            </div>
                            <button onclick="App.Actions.openEditBalance('${u.id}')" class="btn-icon text-gray-400 hover:text-teal-600 hover:bg-teal-50">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },
    'mgr-logs': () => {
        return `
        <div class="card overflow-hidden">
            <div class="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <h3 class="font-bold text-gray-800 text-lg">سجل الحركات</h3>
                <button onclick="App.Export.excel()" class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    تصدير Excel
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="log-table">
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>الموظف</th>
                            <th>النوع</th>
                            <th>القيمة</th>
                            <th>ملاحظات</th>
                            <th>إجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.balanceLogs.length === 0 ? `<tr><td colspan="6" class="text-center py-10 text-gray-400">لا توجد حركات</td></tr>` : 
                        state.balanceLogs.sort((a,b) => b.date?.seconds - a.date?.seconds).map(log => `
                            <tr>
                                <td class="font-medium text-gray-500">${utils.formatDate(log.date)}</td>
                                <td class="font-bold text-gray-800">${log.employeeName}</td>
                                <td>
                                    <span class="badge ${log.type === 'adjustment' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                        ${log.type === 'adjustment' ? 'إضافة' : 'خصم'}
                                    </span>
                                </td>
                                <td class="font-bold ${log.type === 'adjustment' ? 'text-green-600' : 'text-red-600'}">
                                    ${log.type === 'adjustment' ? '+' : '-'} ${log.value.days} يوم
                                </td>
                                <td class="text-gray-500 text-xs max-w-[150px] truncate">${log.notes || '-'}</td>
                                <td>
                                    <button onclick="App.Actions.deleteLog('${log.id}')" class="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50" title="حذف">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
};

// --- Actions & Events ---
const Actions = {
    init: () => {
        utils.$('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const user = CONFIG.users.find(x => x.username === utils.$('username').value && x.password === utils.$('password').value);
            if (user) {
                state.currentUser = user;
                localStorage.setItem('egybev_user', JSON.stringify(user));
                utils.$('login-err').classList.add('hidden');
                App.initDashboard(); // Proceed to dashboard
            } else {
                utils.$('login-err').classList.remove('hidden');
            }
        });
    },
    openEditBalance: (id) => {
        const data = state.employeesData[id] || {};
        const user = CONFIG.users.find(u => u.id === id);
        utils.$('modal-content').innerHTML = `
            <div class="border-b border-gray-100 pb-4 mb-4 flex justify-between items-center">
                <h3 class="font-bold text-xl text-gray-800">تعديل رصيد</h3>
                <span onclick="App.UI.closeModal()" class="text-gray-400 cursor-pointer hover:text-red-500 text-2xl leading-none">&times;</span>
            </div>
            <p class="text-sm text-gray-600 mb-6 bg-gray-50 p-3 rounded-lg border">${user.displayName}</p>
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div><label class="text-xs text-gray-500 block mb-2 font-medium">أيام</label><input type="number" id="edit-days" value="${data.balanceDays || 0}" class="w-full border rounded-xl p-3 text-center font-bold text-lg outline-none"></div>
                <div><label class="text-xs text-gray-500 block mb-2 font-medium">ساعات</label><input type="number" id="edit-hours" value="${data.balanceHours || 0}" max="7" class="w-full border rounded-xl p-3 text-center font-bold text-lg outline-none"></div>
            </div>
            <div class="flex gap-3">
                <button onclick="App.UI.closeModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold text-gray-600 text-sm transition">إلغاء</button>
                <button onclick="App.Actions.saveBalance('${id}')" class="flex-1 btn-primary py-3 rounded-xl text-sm">حفظ التغييرات</button>
            </div>`;
        UI.openModal();
    },
    saveBalance: async (empId) => {
        const days = parseInt(utils.$('edit-days').value) || 0;
        const hours = parseInt(utils.$('edit-hours').value) || 0;
        const user = CONFIG.users.find(u => u.id === empId);
        
        if(state.isFirebaseReady) {
            await setDoc(doc(fb.db, `artifacts/${APP_ID}/public/data/employees`, empId), { balanceDays: days, balanceHours: hours }, { merge: true });
            await addDoc(collection(fb.db, `artifacts/${APP_ID}/public/data/balance_logs`), {
                employeeId: empId, employeeName: user.displayName, type: 'adjustment',
                value: { days, hours }, notes: 'تعديل يدوي', date: new Date()
            });
            utils.toast("تم حفظ الرصيد");
        } else {
            utils.toast("خطأ: غير متصل بقاعدة البيانات", "error");
        }
        UI.closeModal();
    },
    deleteLog: async (logId) => {
        if(!confirm("هل أنت متأكد من حذف هذه العملية؟")) return;
        if(state.isFirebaseReady) {
            await deleteDoc(doc(fb.db, `artifacts/${APP_ID}/public/data/balance_logs`, logId));
            utils.toast("تم حذف العملية");
        }
    }
};

// --- Export Functionality ---
const Export = {
    excel: () => {
        if (state.balanceLogs.length === 0) {
            utils.toast("لا توجد بيانات للتصدير", "error");
            return;
        }
        const data = state.balanceLogs.map(log => ({
            "التاريخ": utils.formatDate(log.date),
            "الموظف": log.employeeName,
            "نوع العملية": log.type === 'adjustment' ? 'إضافة' : 'خصم',
            "الأيام": log.value.days,
            "الساعات": log.value.hours || 0,
            "ملاحظات": log.notes || ''
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "سجل الحركات");
        ws['!cols'] = [{wch: 12}, {wch: 20}, {wch: 12}, {wch: 8}, {wch: 8}, {wch: 30}];
        XLSX.writeFile(wb, `EgyBev_Logs_${new Date().toLocaleDateString('ar-EG')}.xlsx`);
        utils.toast("جاري تصدير الملف...");
    }
};

// --- Main App Object ---
const App = {
    UI: UI,
    Actions: Actions,
    Export: Export,
    Auth: {
        logout: async () => {
            if(fb.auth) await signOut(fb.auth);
            localStorage.removeItem('egybev_user');
            location.reload();
        }
    },
    init: () => {
        fb.init(); // Initialize Firebase
        
        // Check Login
        const storedUser = localStorage.getItem('egybev_user');
        if (storedUser) {
            state.currentUser = JSON.parse(storedUser);
            App.initDashboard();
        }
        Actions.init();
    },
    initDashboard: async () => {
        // 1. Show UI Immediately (Don't wait for Firebase if we have cached user)
        utils.hide('login-section');
        utils.show('dashboard-container');
        UI.renderSidebar();
        Navigation.go(state.currentUser.role === 'manager' ? 'tasks' : 'emp-balance');

        // 2. Connect to Firebase in background
        if (state.isFirebaseReady && fb.auth) {
            onAuthStateChanged(fb.auth, async (user) => {
                if (!user) {
                    try { 
                        await signInAnonymously(fb.auth); 
                        console.log("Anonymous Auth Success");
                        App.setupListeners();
                    } catch(e) { 
                        console.error("Auth Error", e); 
                        // Only show error if it's not the 'already exists' type error which usually resolves itself
                        if(e.code !== 'auth/operation-not-allowed') {
                            utils.toast("تحذير: تعذر الاتصال بمزود الخدمة، البيانات قد لا تحفظ.", "error");
                        }
                    }
                } else {
                    console.log("User already authenticated");
                    App.setupListeners();
                }
            });
        }
    },
    setupListeners: () => {
        if(!state.isFirebaseReady) return;
        const basePath = `artifacts/${APP_ID}/public/data`;
        
        onSnapshot(collection(fb.db, `${basePath}/employees`), (snap) => {
            snap.forEach(d => state.employeesData[d.id] = d.data());
            Renderer.update();
        });
        onSnapshot(query(collection(fb.db, `${basePath}/balance_logs`)), (snap) => {
            state.balanceLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            Renderer.update();
        });
    }
};

// Start App
App.init();
window.App = App;