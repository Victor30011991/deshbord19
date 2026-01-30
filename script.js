let uploadedFiles = [];
let allResults = []; 
let chartD, chartC;

// Troca de Abas (Simples e funcional)
function changeTab(tab) {
    document.getElementById('tab-dashboard').classList.toggle('hidden', tab !== 'dashboard');
    document.getElementById('tab-auditoria').classList.toggle('hidden', tab !== 'auditoria');
    if(tab === 'dashboard' && allResults.length > 0) initDashboard();
}

document.getElementById('fileInput').onchange = async (e) => {
    const files = Array.from(e.target.files);
    uploadedFiles = [];
    for (let file of files) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        uploadedFiles.push({ data: json, name: file.name });
    }
    if(uploadedFiles.length >= 2) processComparison();
};

function processComparison() {
    const t1 = uploadedFiles[0].data;
    const t2 = uploadedFiles[1].data;

    // Indexação por Nome (Performance 13k)
    const mapT2 = new Map();
    t2.forEach(row => {
        const key = String(row.ALUNO || row.NOME || "").toUpperCase().trim();
        if(key) mapT2.set(key, row);
    });

    allResults = t1.map(rowA => {
        const keyA = String(rowA.ALUNO || rowA.NOME_ALUNO || "").toUpperCase().trim();
        const rowB = mapT2.get(keyA) || {};
        
        const statusA = String(rowA.SITUACAO_MATRICULA || "").toUpperCase();
        const statusB = String(rowB.STATUS || rowB.SITUACAO || "").toUpperCase();
        
        const isMatch = statusA === statusB && keyA !== "";
        
        return {
            rowA,
            rowB,
            status: isMatch ? 'IGUAL' : (rowB.ALUNO ? 'DIVERGENTE' : 'AUSENTE'),
            searchKey: (keyA + " " + (rowA.CPF || "")).toUpperCase()
        };
    });

    renderTripleTable();
    initDashboard();
}

function renderTripleTable() {
    const search = document.getElementById('tableSearch').value.toUpperCase();
    const filtered = allResults.filter(i => i.searchKey.includes(search));
    const display = filtered.slice(0, 150); // Performance de Scroll

    const buildRow = (content) => `<tr class="border-b border-white/5 text-[10px]"><td class="p-2">${content}</td></tr>`;

    document.getElementById('tableA').innerHTML = display.map(i => buildRow(`<b class="text-white">${i.rowA.ALUNO || i.rowA.NOME_ALUNO}</b><br><span class="opacity-50">${i.rowA.SITUACAO_MATRICULA || '---'}</span>`)).join('');
    document.getElementById('tableB').innerHTML = display.map(i => buildRow(`<b>${i.rowB.ALUNO || '---'}</b><br><span class="opacity-50">${i.rowB.STATUS || '---'}</span>`)).join('');
    document.getElementById('tableRes').innerHTML = display.map(i => buildRow(`<span class="px-2 py-0.5 rounded ${i.status === 'IGUAL' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-yellow-500/10 text-yellow-500'} font-bold text-[8px]">${i.status}</span>`)).join('');
}

document.getElementById('tableSearch').oninput = renderTripleTable;

function initDashboard() {
    const total = allResults.length;
    const diffs = allResults.filter(i => i.status !== 'IGUAL').length;
    const acc = total > 0 ? ((total - diffs) / total * 100).toFixed(1) : 0;

    document.getElementById('totalRecords').innerText = total;
    document.getElementById('diffCounter').innerText = diffs;
    document.getElementById('accuracyRate').innerText = acc + "%";

    updateCharts(diffs, total);
}

function updateCharts(d, t) {
    const ctx = document.getElementById('chartDiff').getContext('2d');
    if(chartD) chartD.destroy();
    chartD = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Divergentes', 'Iguais'],
            datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }]
        },
        options: { cutout: '80%', plugins: { legend: { display: false } } }
    });
}
