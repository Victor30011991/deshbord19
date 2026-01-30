let rawA = [], rawB = [], audited = [];
let charts = {};
let currentFilter = 'todos';
let searchTerm = '';

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    
    if (id === 'tab-dash' && audited.length > 0) {
        setTimeout(updateDashboard, 100); 
    }
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return;
    
    rawA = await parseFile(files[0]);
    rawB = await parseFile(files[1]);
    
    processAudit();
});

async function parseFile(file) {
    return new Promise(resolve => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true, encoding: "ISO-8859-1",
            complete: r => resolve(r.data)
        });
    });
}

function processAudit() {
    // Indexação por Primeiro Nome para performance O(n)
    const indexB = new Map();
    rawB.forEach(row => {
        const nome = String(row.ALUNO || row.NOME || "").split(' ')[0].toUpperCase();
        if (nome) indexB.set(nome, row);
    });

    audited = rawA.map(rowA => {
        const nomeA = String(rowA.NOME_ALUNO || rowA.ALUNO || "").toUpperCase().trim();
        const rowB = indexB.get(nomeA.split(' ')[0]);
        
        let status = 'ausente';
        if (rowB) {
            const stA = String(rowA.SITUACAO_MATRICULA || "").toUpperCase();
            const stB = String(rowB.STATUS || rowB.SITUACAO || "").toUpperCase();
            status = (stA === stB || (stA.includes("CONCLU") && stB.includes("CONCLU"))) ? 'relacionado' : 'divergente';
        }
        return { dataA: rowA, dataB: rowB || {}, status: status, searchKey: (nomeA + " " + (rowA.CPF || "")).toUpperCase() };
    });
    
    document.getElementById('btnExport').classList.remove('hidden');
    renderDiagnostics();
    renderAcertos();
    renderTripleTable();
    updateDashboard();
    switchTab('tab-conf');
}

function renderTripleTable() {
    const data = audited.filter(r => {
        const matchesFilter = currentFilter === 'todos' || r.status === currentFilter;
        const matchesSearch = searchTerm === '' || r.searchKey.includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    const display = data.slice(0, 150); // Virtualização leve

    const head = (cols) => `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
    
    document.getElementById('tableA').innerHTML = head(['Aluno Base A', 'Status']) + 
        `<tbody>${display.map(r => `<tr><td class="font-bold text-white">${r.dataA.NOME_ALUNO || r.dataA.ALUNO}</td><td>${r.dataA.SITUACAO_MATRICULA || '---'}</td></tr>`).join('')}</tbody>`;

    document.getElementById('tableB').innerHTML = head(['Aluno Base B', 'Status']) + 
        `<tbody>${display.map(r => `<tr><td>${r.dataB.ALUNO || '---'}</td><td>${r.dataB.STATUS || '---'}</td></tr>`).join('')}</tbody>`;

    document.getElementById('tableRes').innerHTML = head(['Veredito']) + 
        `<tbody>${display.map(r => `<tr><td><span class="badge ${r.status === 'relacionado' ? 'bg-emerald-500/20 text-emerald-400' : r.status === 'divergente' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700'}">${r.status}</span></td></tr>`).join('')}</tbody>`;
}

document.getElementById('tableSearch').addEventListener('input', (e) => {
    searchTerm = e.target.value.toUpperCase();
    renderTripleTable();
});

function applyFilter(type) {
    currentFilter = type;
    document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('f-' + type).classList.add('active');
    renderTripleTable();
}

function updateDashboard() {
    const stats = {
        total: audited.length,
        rel: audited.filter(r => r.status === 'relacionado').length,
        div: audited.filter(r => r.status === 'divergente').length,
        aus: audited.filter(r => r.status === 'ausente').length
    };

    document.getElementById('kpi-grid').innerHTML = `
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5 shadow-lg"><span>Total</span><h2 class="text-3xl font-black">${stats.total}</h2></div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5 shadow-lg"><span>Relacionados</span><h2 class="text-3xl font-black text-emerald-400">${stats.rel}</h2></div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5 shadow-lg"><span>Divergentes</span><h2 class="text-3xl font-black text-orange-400">${stats.div}</h2></div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5 shadow-lg"><span>Não Vinculados</span><h2 class="text-3xl font-black opacity-30">${stats.aus}</h2></div>
    `;

    const ctx = document.getElementById('chartStatus').getContext('2d');
    if (charts.status) charts.status.destroy();
    charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Divergente', 'Relacionado', 'Ausente'], datasets: [{ data: [stats.div, stats.rel, stats.aus], backgroundColor: ['#f59e0b', '#10b981', '#1e293b'], borderWidth: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#fff' } } } }
    });
}

function exportToExcel() {
    const wsData = audited.map(r => ({
        "Aluno Base A": r.dataA.NOME_ALUNO || r.dataA.ALUNO,
        "Status Base A": r.dataA.SITUACAO_MATRICULA,
        "Aluno Base B": r.dataB.ALUNO || "---",
        "Status Base B": r.dataB.STATUS || "---",
        "Resultado": r.status
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "Relatorio_Auditoria.xlsx");
}

function renderDiagnostics() {
    document.getElementById('diag-container').innerHTML = `
        <div class="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-3xl text-center">
            <h3 class="text-emerald-400 font-bold text-xl mb-2">Processamento Concluído</h3>
            <p class="text-sm">Cruzamento de ${audited.length} registros realizado com sucesso.</p>
        </div>
    `;
}

function renderAcertos() {
    const list = audited.filter(r => r.status === 'ausente').slice(0, 10);
    document.getElementById('acerto-list').innerHTML = `<h2 class="font-bold mb-4">Principais Não Vinculados</h2>` + 
        list.map(r => `<div class="bg-white/5 p-4 rounded-xl flex justify-between items-center"><span>${r.dataA.NOME_ALUNO}</span><button class="text-blue-500 text-[10px] font-bold">VINCULAR MANUAL</button></div>`).join('');
}
