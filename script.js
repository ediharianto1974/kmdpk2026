import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, writeBatch, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyAV5A-AB2PYmPf7nvAKRu2b9d73Usd0HO0",
    authDomain: "merentas-809e2.firebaseapp.com",
    projectId: "merentas-809e2",
    storageBucket: "merentas-809e2.firebasestorage.app",
    messagingSenderId: "749985566541",
    appId: "1:749985566541:web:2b6153c30cf310db1eb104",
    measurementId: "G-FWCPVKDC23"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- GLOBAL VARIABLES ---
let allParticipants = [];
let categories = new Set();
let teams = new Set();
let currentUser = null;

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const adminMenu = document.getElementById('admin-menu');
    const loginBtn = document.getElementById('btn-login-nav');
    const adminElements = document.querySelectorAll('.admin-only'); 
    
    if (user) {
        if(adminMenu) adminMenu.classList.remove('hidden');
        if(loginBtn) loginBtn.classList.add('hidden');
        document.getElementById('login-modal').classList.add('hidden');
        adminElements.forEach(el => el.classList.remove('hidden')); 
        showToast(`Selamat datang, Admin!`, 'success');
        // Data di-fetch, splash screen dikawal dalam fetchParticipants
        fetchParticipants(); 
    } else {
        if(adminMenu) adminMenu.classList.add('hidden');
        if(loginBtn) loginBtn.classList.remove('hidden');
        adminElements.forEach(el => el.classList.add('hidden')); 
        
        if(typeof showSection === 'function') showSection('analisis');
        fetchParticipants(); 
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showToast("Login Gagal: " + error.message, 'error');
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => {
        showToast("Berjaya Log Keluar", 'success');
        setTimeout(() => window.location.reload(), 1000);
    });
});

// --- FUNGSI: SPLASH SCREEN CONTROL ---
function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    const body = document.getElementById('body-content');
    if(splash) {
        // Tambah delay sikit supaya nampak logo branding
        setTimeout(() => {
            splash.style.opacity = '0'; // Fade out
            setTimeout(() => {
                splash.classList.add('hidden'); // Remove dari view
                if(body) body.classList.remove('overflow-hidden'); // Benarkan scroll
            }, 700); // Tunggu transition habis
        }, 1500); // Minimum masa paparan (1.5 saat)
    }
}

// --- FUNGSI: FETCH DATA ---
async function fetchParticipants() {
    const q = query(collection(db, "participants"));
    try {
        const querySnapshot = await getDocs(q);
        allParticipants = [];
        categories = new Set();
        teams = new Set();
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id;
            allParticipants.push(data);
            categories.add(data.category);
            teams.add(data.team);
        });
        populateDropdowns();
        renderParticipantTable();
        renderParticipationStats(); 
    } catch (e) {
        console.error("Error fetching data:", e);
        showToast("Gagal mengambil data.", "error");
    } finally {
        // Hilangkan Splash Screen sama ada berjaya atau gagal
        hideSplashScreen();
    }
}

// --- FUNGSI: PROCESS CSV (DAFTAR) ---
window.processCSV = async function() {
    const fileInput = document.getElementById('csv-file');
    const file = fileInput.files[0];
    if (!file) {
        showToast("Sila pilih fail CSV dahulu!", 'error');
        return;
    }
    const spinner = document.getElementById('loading-spinner');
    spinner.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const rows = text.split('\n').map(row => row.trim()).filter(row => row);
        let batch = writeBatch(db);
        let count = 0;
        const startIdx = rows[0].toLowerCase().includes('nobadan') ? 1 : 0;
        for (let i = startIdx; i < rows.length; i++) {
            const cols = rows[i].split(',');
            if (cols.length < 5) continue; 
            const docRef = doc(collection(db, "participants")); 
            const data = {
                bodyNo: cols[0].trim(),
                name: cols[1].trim(),
                gender: cols[2].trim().toUpperCase(),
                category: cols[3].trim(),
                team: cols[4].trim(),
                rank: null, time: null, score: null
            };
            batch.set(docRef, data);
            count++;
            if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
        }
        if (count > 0) await batch.commit();
        spinner.classList.add('hidden');
        showToast(`Berjaya memuat naik ${rows.length - startIdx} peserta!`, 'success');
        fileInput.value = ''; 
        fetchParticipants(); 
    };
    reader.readAsText(file);
};

// --- FUNGSI BARU: RENDER STATISTIK PENYERTAAN ---
function renderParticipationStats() {
    const totalP = document.getElementById('stat-total-p');
    const totalT = document.getElementById('stat-total-t');
    if(totalP) totalP.textContent = allParticipants.length;
    if(totalT) totalT.textContent = teams.size;

    const maleTable = document.getElementById('stat-male-breakdown');
    const femaleTable = document.getElementById('stat-female-breakdown');
    if(!maleTable || !femaleTable) return;

    maleTable.innerHTML = '';
    femaleTable.innerHTML = '';

    const sortedCats = Array.from(categories).sort();
    
    const addRow = (table, cat, count) => {
        table.innerHTML += `
            <tr class="border-b">
                <td class="py-2 px-2 font-medium">${cat}</td>
                <td class="py-2 px-2 text-right font-bold text-gray-700">${count}</td>
            </tr>
        `;
    };

    sortedCats.forEach(cat => {
        const maleCount = allParticipants.filter(p => p.category === cat && p.gender === 'L').length;
        const femaleCount = allParticipants.filter(p => p.category === cat && p.gender === 'P').length;
        if(maleCount > 0) addRow(maleTable, cat, maleCount);
        if(femaleCount > 0) addRow(femaleTable, cat, femaleCount);
    });
}

function populateDropdowns() {
    const catSelect = document.getElementById('filter-category');
    const teamSelect = document.getElementById('filter-team');
    const resultTeamSelect = document.getElementById('result-team');
    const analysisCat = document.getElementById('analysis-category');
    const printSchool = document.getElementById('print-list-school');
    const printCat = document.getElementById('print-result-category');

    if(catSelect) catSelect.innerHTML = '<option value="">Semua Kategori</option>';
    if(teamSelect) teamSelect.innerHTML = '<option value="">Semua Pasukan</option>';
    if(resultTeamSelect) resultTeamSelect.innerHTML = '<option value="">Pilih Sekolah...</option>';
    if(analysisCat) analysisCat.innerHTML = '<option value="">-- Sila Pilih Kategori --</option>';
    if(printSchool) printSchool.innerHTML = '<option value="">Semua Sekolah</option>';
    if(printCat) printCat.innerHTML = '<option value="">Pilih Kategori</option>';

    const sortedCategories = Array.from(categories).sort();
    sortedCategories.forEach(c => {
        if(catSelect) catSelect.innerHTML += `<option value="${c}">${c}</option>`;
        if(analysisCat) analysisCat.innerHTML += `<option value="${c}">${c}</option>`;
        if(printCat) printCat.innerHTML += `<option value="${c}">${c}</option>`;
    });
    
    const sortedTeams = Array.from(teams).sort();
    sortedTeams.forEach(t => {
        if(teamSelect) teamSelect.innerHTML += `<option value="${t}">${t}</option>`;
        if(resultTeamSelect) resultTeamSelect.innerHTML += `<option value="${t}">${t}</option>`;
        if(printSchool) printSchool.innerHTML += `<option value="${t}">${t}</option>`;
    });
    
    const countDisplay = document.getElementById('participant-count');
    if(countDisplay) countDisplay.innerText = `Jumlah Peserta: ${allParticipants.length}`;
}

window.filterParticipants = function() { renderParticipantTable(); };

function renderParticipantTable() {
    const gender = document.getElementById('filter-gender').value;
    const category = document.getElementById('filter-category').value;
    const team = document.getElementById('filter-team').value;
    const tbody = document.getElementById('participants-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    const filtered = allParticipants.filter(p => {
        return (gender === '' || p.gender === gender) &&
               (category === '' || p.category === category) &&
               (team === '' || p.team === team);
    });
    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 border-b";
        tr.innerHTML = `
            <td class="py-2 px-4">${p.bodyNo}</td><td class="py-2 px-4 font-medium">${p.name}</td>
            <td class="py-2 px-4 text-center">${p.gender}</td><td class="py-2 px-4">${p.category}</td>
            <td class="py-2 px-4">${p.team}</td>
            <td class="py-2 px-4 text-center">
                ${currentUser ? `<button onclick="deleteParticipant('${p.id}')" class="text-red-500 hover:text-red-700 bg-red-100 p-1 rounded"><i class="fa-solid fa-trash"></i></button>` : '-'}
            </td>`;
        tbody.appendChild(tr);
    });
}

window.deleteParticipant = async function(id) {
    if(!confirm("Anda pasti mahu memadam peserta ini?")) return;
    try { await deleteDoc(doc(db, "participants", id)); showToast("Peserta dipadam", 'success'); fetchParticipants(); } 
    catch(e) { showToast("Gagal memadam", 'error'); }
}

// --- KEMASKINI KEPUTUSAN ---
let currentResultList = [];
window.loadParticipantsForResult = function() {
    const teamName = document.getElementById('result-team').value;
    const genderVal = document.getElementById('result-gender').value;
    if (!teamName || !genderVal) { showToast("Sila pilih Sekolah DAN Jantina", 'error'); return; }
    currentResultList = allParticipants.filter(p => p.team === teamName && p.gender === genderVal);
    currentResultList.sort((a, b) => {
        if (a.category < b.category) return -1; if (a.category > b.category) return 1;
        return a.name.localeCompare(b.name);
    });
    const tbody = document.getElementById('result-table-body');
    tbody.innerHTML = '';
    if (currentResultList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold bg-red-50">Tiada peserta ditemui.</td></tr>';
        document.getElementById('result-entry-area').classList.remove('hidden'); return;
    }
    currentResultList.forEach((p) => {
        const tr = document.createElement('tr');
        tr.className = `border-b hover:bg-gray-100 ${p.gender === 'L' ? 'bg-blue-50' : 'bg-pink-50'}`;
        tr.innerHTML = `
            <td class="p-2 border font-mono text-sm text-center">${p.bodyNo}</td>
            <td class="p-2 border text-sm font-semibold">${p.name}</td>
            <td class="p-2 border text-center text-xs font-bold text-gray-600">${p.category}</td>
            <td class="p-2 border"><input type="number" id="rank-${p.id}" value="${p.rank || ''}" class="w-full p-2 border rounded text-center font-bold text-lg" placeholder="-" min="1"></td>
            <td class="p-2 border"><input type="text" id="time-${p.id}" value="${p.time || ''}" class="w-full p-2 border rounded text-sm text-center" placeholder="mm:ss"></td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('result-entry-area').classList.remove('hidden');
};

window.saveResults = async function() {
    if (!confirm("Simpan keputusan ini?")) return;
    const batch = writeBatch(db);
    let updateCount = 0;
    currentResultList.forEach(p => {
        const rankInput = document.getElementById(`rank-${p.id}`);
        const timeInput = document.getElementById(`time-${p.id}`);
        if(rankInput && timeInput) {
            let rank = rankInput.value ? parseInt(rankInput.value) : null;
            let score = rank ? rank : null;
            batch.update(doc(db, "participants", p.id), { rank: rank, time: timeInput.value, score: score });
            updateCount++;
        }
    });
    try { await batch.commit(); showToast(`Berjaya menyimpan data!`, 'success'); await fetchParticipants(); } 
    catch (e) { showToast("Ralat: " + e.message, 'error'); }
};

// --- ANALISIS ---
window.switchAnalysisTab = function(tabName) {
    document.getElementById('analysis-dashboard').classList.add('hidden');
    document.getElementById('content-school').classList.add('hidden');
    document.getElementById('content-individual').classList.add('hidden');

    const btnSchool = document.getElementById('btn-tab-school');
    const btnInd = document.getElementById('btn-tab-individual');
    const defaultStyle = "w-1/2 md:w-1/4 py-3 text-center font-bold text-gray-500 hover:text-blue-600 border-b-4 border-transparent hover:border-blue-300 transition-all";
    const activeStyle = "w-1/2 md:w-1/4 py-3 text-center font-bold text-blue-700 border-b-4 border-blue-700 transition-all";

    btnSchool.className = defaultStyle;
    btnInd.className = defaultStyle;

    if (tabName === 'school') {
        document.getElementById('content-school').classList.remove('hidden');
        btnSchool.className = activeStyle;
        calculateTeamAnalysis(); 
    } else if (tabName === 'individual') {
        document.getElementById('content-individual').classList.remove('hidden');
        btnInd.className = activeStyle;
        document.getElementById('analysis-ind-body').innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500 italic">Sila pilih Kategori dan Jantina.</td></tr>';
        document.getElementById('analysis-category').value = "";
        document.getElementById('analysis-gender').value = "";
    }
};

window.loadIndividualAnalysis = function() {
    const category = document.getElementById('analysis-category').value;
    const gender = document.getElementById('analysis-gender').value;
    const tbody = document.getElementById('analysis-ind-body');
    if (!category || !gender) { tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500 italic">Pilih Kategori & Jantina.</td></tr>'; return; }

    let list = allParticipants.filter(p => p.category === category && p.gender === gender);
    let ranked = list.filter(p => p.rank).sort((a, b) => a.rank - b.rank);
    let unranked = list.filter(p => !p.rank);
    let final = [...ranked, ...unranked];
    tbody.innerHTML = '';
    if(final.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-red-500">Tiada peserta.</td></tr>'; return; }

    final.forEach((p) => {
        let rClass = p.rank === 1 ? 'bg-yellow-100 text-yellow-700 font-bold' : p.rank === 2 ? 'bg-gray-100 text-gray-700 font-bold' : p.rank === 3 ? 'bg-orange-50 text-orange-700 font-bold' : '';
        tbody.innerHTML += `<tr class="border-b ${rClass}"><td class="p-3 text-center">${p.rank||'-'}</td><td class="p-3">${p.name}</td><td class="p-3 text-center">${p.category}</td><td class="p-3 text-center">${p.gender}</td><td class="p-3">${p.team}</td><td class="p-3 text-center">${p.time||'-'}</td></tr>`;
    });
};

function calculateTeamAnalysis() {
    const container = document.getElementById('team-standings-container');
    if(!container) return;
    container.innerHTML = '';
    let standings = [];
    teams.forEach(t => {
        let m = allParticipants.filter(p => p.team === t).sort((a,b)=>(a.score||9999)-(b.score||9999));
        if (m.length < 3) return;
        standings.push({ team: t, total: m.slice(0,3).reduce((s,x)=>s+(x.score||0),0), top3: m.slice(0,3), fourth: m[3] });
    });
    standings.sort((a,b)=>a.total !== b.total ? a.total-b.total : (a.fourth?.score||9999)-(b.fourth?.score||9999));
    
    if(standings.length===0) { container.innerHTML = '<div class="text-center p-4">Tiada data.</div>'; return; }
    
    let rows = standings.map((s, i) => `
        <tr class="${i===0?'bg-yellow-50 border-l-4 border-yellow-500':'border-b'}">
            <td class="p-4 font-bold text-center text-xl">${i+1}</td>
            <td class="p-4 font-bold">${s.team}</td><td class="p-4 text-center font-bold text-2xl text-blue-900">${s.total}</td>
            <td class="p-4 text-sm">${s.top3.map(x=>`${x.name} (#${x.rank})`).join(', ')}</td>
            <td class="p-4 text-center text-red-600 font-bold text-xs">${s.fourth?s.fourth.name+' (#'+s.fourth.rank+')':'-'}</td>
        </tr>`).join('');
    container.innerHTML = `<div class="bg-white rounded shadow overflow-hidden"><table class="w-full text-left"><thead class="bg-gray-100"><tr><th class="p-4 text-center">Ked.</th><th class="p-4">Sekolah</th><th class="p-4 text-center">Mata</th><th class="p-4">Penyumbang</th><th class="p-4 text-center">Tie-Breaker</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// --- FUNGSI CETAK ---
function openPrintWindow(title, contentHtml) {
    const w = window.open('', '', 'width=900,height=600');
    w.document.write(`<html><head><title>${title}</title><style>
        body { font-family: Arial; padding: 20px; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
        th, td { border: 1px solid black; padding: 5px; text-align: left; } th { background: #eee; text-align: center; } .center { text-align: center; }
        h1, h2 { text-align: center; margin: 5px; } h3 { margin-top: 20px; border-bottom: 2px solid black; } .page-break { page-break-after: always; }
    </style></head><body><h1>KEJOHANAN MERENTAS DESA PENDIDIKAN KHAS (KMDPK) 2026</h1><h2>${title}</h2>${contentHtml}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 500);
}

// 1. CETAK SENARAI PESERTA
window.printParticipantList = function() {
    const schoolFilter = document.getElementById('print-list-school').value;
    const genderFilter = document.getElementById('print-list-gender').value;

    let data = allParticipants.filter(p => {
        return (schoolFilter === '' || p.team === schoolFilter) &&
               (genderFilter === '' || p.gender === genderFilter);
    });

    if (data.length === 0) { alert("Tiada data."); return; }

    const distinctTeams = [...new Set(data.map(p => p.team))].sort();
    let printHtml = "";

    distinctTeams.forEach((teamName, index) => {
        if (genderFilter === '' || genderFilter === 'L') {
            const males = data.filter(p => p.team === teamName && p.gender === 'L').sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
            if (males.length > 0) printHtml += generateTableHTML(teamName, "LELAKI", males);
        }
        if (genderFilter === '' || genderFilter === 'P') {
            const females = data.filter(p => p.team === teamName && p.gender === 'P').sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
            if (females.length > 0) printHtml += generateTableHTML(teamName, "PEREMPUAN", females);
        }
        if(index < distinctTeams.length - 1) printHtml += "<br><hr><br>";
    });

    openPrintWindow(`SENARAI PENDAFTARAN PESERTA`, printHtml);
};

function generateTableHTML(school, genderTitle, participants) {
    let rows = participants.map((p, i) => `<tr><td class="center">${i + 1}</td><td class="center">${p.bodyNo}</td><td>${p.name}</td><td class="center">${p.category}</td></tr>`).join('');
    return `<h3>${school} - ${genderTitle}</h3><table><thead><tr><th width="5%">Bil</th><th width="15%">No. Badan</th><th>Nama Peserta</th><th width="10%">Kategori</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// 2. CETAK KEPUTUSAN PENUH
window.printFullResults = function() {
    const category = document.getElementById('print-result-category').value;
    const gender = document.getElementById('print-result-gender').value;
    if (!category || !gender) { alert("Sila pilih Kategori dan Jantina."); return; }
    let data = allParticipants.filter(p => p.category === category && p.gender === gender);
    let ranked = data.filter(p => p.rank).sort((a, b) => a.rank - b.rank);
    let unranked = data.filter(p => !p.rank);
    let rows = [...ranked, ...unranked].map(p => `<tr><td class="center">${p.rank||'-'}</td><td class="center">${p.bodyNo}</td><td>${p.name}</td><td>${p.team}</td><td class="center">${p.time||'-'}</td></tr>`).join('');
    openPrintWindow(`KEPUTUSAN: ${category} (${gender})`, `<table><thead><tr><th>Rank</th><th>No</th><th>Nama</th><th>Sekolah</th><th>Masa</th></tr></thead><tbody>${rows}</tbody></table>`);
};

// 3. CETAK RANKING SEKOLAH
window.printSchoolStandings = function() {
    let standings = [];
    teams.forEach(t => {
        let m = allParticipants.filter(p => p.team === t).sort((a,b)=>(a.score||9999)-(b.score||9999));
        if (m.length >= 3) standings.push({ team: t, total: m.slice(0,3).reduce((s,x)=>s+(x.score||0),0), top3: m.slice(0,3), fourth: m[3] });
    });
    standings.sort((a,b)=>a.total !== b.total ? a.total-b.total : (a.fourth?.score||9999)-(b.fourth?.score||9999));
    let rows = standings.map((s, i) => `<tr><td class="center">${i+1}</td><td>${s.team}</td><td class="center">${s.total}</td><td style="font-size:9pt">${s.top3.map(x=>`#${x.rank} ${x.name}`).join('<br>')}</td><td class="center" style="color:red">${s.fourth?`#${s.fourth.rank} ${s.fourth.name}`:'-'}</td></tr>`).join('');
    openPrintWindow("RANKING KESELURUHAN SEKOLAH", `<table><thead><tr><th>Ked.</th><th>Sekolah</th><th>Mata</th><th>Penyumbang</th><th>Tie-Breaker</th></tr></thead><tbody>${rows}</tbody></table>`);
};

// --- UTILITIES ---
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    let bgClass = type === 'success' ? "bg-green-600" : type === 'error' ? "bg-red-600" : "bg-blue-600";
    toast.className = `fixed top-5 right-5 px-6 py-4 rounded shadow-lg text-white z-50 ${bgClass} toast-show`;
    setTimeout(() => { toast.className = `fixed top-5 right-5 px-6 py-4 rounded shadow-lg text-white z-50 ${bgClass} toast-hide`; setTimeout(() => toast.classList.add('hidden'), 300); }, 3000);
}