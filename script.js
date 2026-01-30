let rawA = [], rawB = [], audited = [];
let charts = {};
let currentFilter = 'todos';
let searchTerm = '';

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    
    // Fix: Redesenha o dashboard toda vez que entra na aba para evitar sumiço
    if (id === 'tab-dash' && audited.length > 0) {
        setTimeout(updateDashboard, 50); 
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
    const indexB = new Map();
    rawB.forEach(row => {
        const nome = String(row.ALUNO || row.NOME || "").split(' ')[0].toUpperCase();
        if (nome) indexB.set(nome, row);
    });

    audited = rawA.map(rowA => {
        const nomeA = String(rowA.NOME_ALUNO || rowA.ALUNO || "").toUpperCase().trim();
        const matchB = indexB.get(nomeA.split(' ')[0]);
        
        let status = 'ausente';
        if (matchB) {
            const stA = String(rowA.SITUACAO_MATRICULA || "").trim().toUpperCase();
            const stB = String(matchB.STATUS || matchB.SITUACAO || "").trim().toUpperCase();
            // Lógica de equivalência flexível
            status = (stA === stB || (stA.includes("CONCLU") && stB.includes("CONCLU"))) ? 'relacionado' : 'divergente';
        }

        return { 
            dataA: rowA, 
            dataB: matchB || {}, 
            status: status, 
            searchKey: (nomeA + " " + (rowA.CPF || "") + " " + (rowA.CIDADE || "")).toUpperCase() 
        };
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

    const display = data.slice(0, 150); 
    const head = (cols) => `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
    
    // Tabela A (Mais Informações: Aluno e CPF)
    document.getElementById('tableA').innerHTML = head(['Aluno Base A', 'CPF/Doc', 'Status']) + 
        `<tbody>${display.map(r => `<tr><td class="font-bold text-white">${r.dataA.NOME_ALUNO || r.dataA.ALUNO}</td><td class="opacity-40">${r.dataA.CPF || '---'}</td><td>${r.dataA.SITUACAO_MATRICULA || '---'}</td></tr>`).join('')}</tbody>`;

    // Tabela B (Mais Informações: Aluno e Cidade)
    document.getElementById('tableB').innerHTML = head(['Aluno Base B', 'Cidade', 'Status']) + 
        `<tbody>${display.map(r => `<tr><td class="text-slate-400">${r.dataB.ALUNO || r.dataB.NOME || '---'}</td><td class="text-[8px] opacity-30">${r.dataB.CIDADE || '---'}</td><td>${r.dataB.STATUS || '---'}</td></tr>`).join('')}</tbody>`;

    // Veredito
    document.getElementById('tableRes').innerHTML = head(['Resultado AI', 'Nota']) + 
        `<tbody>${display.map(r => `<tr><td><span class="badge ${r.status === 'relacionado' ? 'bg-emerald-500/20 text-emerald-400' : r.status === 'divergente' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'}">${r.status}</span></td><td class="text-[9px] opacity-30">${r.status === 'relacionado' ? '100%' : 'Verificar'}</td></tr>`).join('')}</tbody>`;
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
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5">
            <span class="text-[9px] font-bold opacity-30 block mb-1 uppercase">Processados</span>
            <h2 class="text-3xl font-black">${stats.total.toLocaleString()}</h2>
        </div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5">
            <span class="text-[9px] font-bold text-emerald-400 block mb-1 uppercase">OK (Match)</span>
            <h2 class="text-3xl font-black text-emerald-400">${stats.rel.toLocaleString()}</h2>
        </div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5">
            <span class="text-[9px] font-bold text-orange-400 block mb-1 uppercase">Divergentes</span>
            <h2 class="text-3xl font-black text-orange-400">${stats.div.toLocaleString()}</h2>
        </div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5">
            <span class="text-[9px] font-bold opacity-30 block mb-1 uppercase">Não Localizados</span>
            <h2 class="text-3xl font-black opacity-30">${stats.aus.toLocaleString()}</h2>
        </div>
    `;

    const ctxS = document.getElementById('chartStatus').getContext('2d');
    if (charts.status) charts.status.destroy();
    charts.status = new Chart(ctxS, {
        type: 'doughnut',
        data: { labels: ['Divergente', 'Relacionado', 'Ausente'], datasets: [{ data: [stats.div, stats.rel, stats.aus], backgroundColor: ['#f59e0b', '#10b981', '#1e293b'], borderWidth: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#fff', font: { size: 10 } } } } }
    });
}

function exportToExcel() {
    const exportData = audited.map(r => ({
        "ALUNO_BASE_A": r.dataA.NOME_ALUNO || r.dataA.ALUNO,
        "STATUS_BASE_A": r.dataA.SITUACAO_MATRICULA,
        "ALUNO_BASE_B": r.dataB.ALUNO || "---",
        "STATUS_BASE_B": r.dataB.STATUS || "---",
        "VEREDITO": r.status.toUpperCase()
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultado_Auditoria");
    XLSX.writeFile(wb, `Auditoria_Enterprise_${new Date().toLocaleDateString()}.xlsx`);
}

function renderDiagnostics() {
    document.getElementById('diag-container').innerHTML = `
        <div class="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-3xl text-center">
            <div class="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500 font-bold">✓</div>
            <h3 class="text-emerald-400 font-bold text-xl mb-2">Base Analisada</h3>
            <p class="text-sm opacity-60">Cruzamento de ${audited.length} linhas concluído em milissegundos.</p>
        </div>
    `;
}

function renderAcertos() {
    const aus = audited.filter(r => r.status === 'ausente').slice(0, 15);
    document.getElementById('acerto-list').innerHTML = `<h3 class="text-white font-bold mb-4 uppercase text-xs">Vínculos não encontrados (Top 15)</h3>` + 
        aus.map(r => `<div class="bg-white/5 p-4 rounded-xl flex justify-between items-center border border-white/5 shadow-lg">
            <span class="text-sm font-bold text-white">${r.dataA.NOME_ALUNO}</span>
            <button class="bg-blue-600/20 text-blue-500 text-[9px] font-black px-3 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition-all uppercase">Tratar Manual</button>
        </div>`).join('');
}
