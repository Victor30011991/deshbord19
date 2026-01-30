let rawA = [], rawB = [], auditResult = [];
let currentTab = 'tab-conf';
let currentFilter = 'todos';
let charts = {};

// FUNÇÃO DE NAVEGAÇÃO (CORRIGIDA)
function showTab(id) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    document.getElementById('nav-' + id.split('-')[1]).classList.add('active');
    
    currentTab = id;
    if (id === 'tab-dash') {
        setTimeout(renderDashboard, 100); // Força renderização do gráfico
    }
}

// UPLOAD E PROCESSAMENTO
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length < 2) return;

    rawA = await parseFile(files[0]);
    rawB = await parseFile(files[1]);

    // Criar Relação (Veredito)
    const mapB = new Map(rawB.map(i => [String(i.ALUNO || i.NOME || "").toUpperCase().trim(), i]));

    auditResult = rawA.map(rowA => {
        const nomeA = String(rowA.ALUNO || rowA.NOME_ALUNO || "").toUpperCase().trim();
        const rowB = mapB.get(nomeA);
        
        let status = 'ausente';
        if (rowB) {
            status = (String(rowA.SITUACAO_MATRICULA || "").trim() === String(rowB.STATUS || "").trim()) 
                     ? 'relacionado' : 'divergente';
        }
        return { dataA: rowA, dataB: rowB || {}, status };
    });

    document.getElementById('btnDownload').classList.remove('hidden');
    updateAllScreens();
});

async function parseFile(file) {
    return new Promise(resolve => {
        Papa.parse(file, { header: true, skipEmptyLines: true, encoding: "ISO-8859-1", complete: r => resolve(r.data) });
    });
}

function updateAllScreens() {
    renderTripleView();
    renderDiagnostics();
    if (currentTab === 'tab-dash') renderDashboard();
}

// RENDERIZAÇÃO DA CONFERÊNCIA (TRIPLE VIEW)
function renderTripleView() {
    const searchTerm = document.getElementById('globalSearch').value.toUpperCase();
    const filtered = auditResult.filter(i => {
        const matchesFilter = currentFilter === 'todos' || i.status === currentFilter;
        const matchesSearch = !searchTerm || JSON.stringify(i).toUpperCase().includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    const display = filtered.slice(0, 100); // Mostra 100 por vez para leveza
    
    const h = (txt) => `<thead><tr><th>${txt}</th><th>Status</th></tr></thead>`;
    
    document.getElementById('tableA').innerHTML = h('Base A') + `<tbody>${display.map(i => `<tr><td>${i.dataA.ALUNO || i.dataA.NOME_ALUNO}</td><td>${i.dataA.SITUACAO_MATRICULA || '-'}</td></tr>`).join('')}</tbody>`;
    document.getElementById('tableB').innerHTML = h('Base B') + `<tbody>${display.map(i => `<tr><td>${i.dataB.ALUNO || i.dataB.NOME || '---'}</td><td>${i.dataB.STATUS || i.dataB.SITUACAO || '---'}</td></tr>`).join('')}</tbody>`;
    document.getElementById('tableRes').innerHTML = `<thead><tr><th>Veredito AI</th></tr></thead><tbody>${display.map(i => `<tr><td><span class="badge ${i.status === 'relacionado' ? 'bg-emerald-500/20 text-emerald-400' : i.status === 'divergente' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700'}">${i.status}</span></td></tr>`).join('')}</tbody>`;
}

// DASHBOARD (CORRIGIDO PARA NÃO SUMIR)
function renderDashboard() {
    if (auditResult.length === 0) return;

    const stats = {
        rel: auditResult.filter(i => i.status === 'relacionado').length,
        div: auditResult.filter(i => i.status === 'divergente').length,
        aus: auditResult.filter(i => i.status === 'ausente').length
    };

    document.getElementById('kpi-row').innerHTML = `
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5"><span>Total</span><h2 class="text-2xl font-black">${auditResult.length}</h2></div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5"><span class="text-emerald-400">Match</span><h2 class="text-2xl font-black">${stats.rel}</h2></div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5"><span class="text-orange-400">Divergente</span><h2 class="text-2xl font-black">${stats.div}</h2></div>
        <div class="bg-[#0f172a] p-5 rounded-2xl border border-white/5"><span class="opacity-30">Ausente</span><h2 class="text-2xl font-black">${stats.aus}</h2></div>
    `;

    const ctx = document.getElementById('chartStatus').getContext('2d');
    if (charts.status) charts.status.destroy();
    charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Relacionados', 'Divergentes', 'Ausentes'],
            datasets: [{ data: [stats.rel, stats.div, stats.aus], backgroundColor: ['#10b981', '#f59e0b', '#334155'], borderWidth: 0 }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }
    });
}

// FILTROS E BUSCA
function filterByStatus(s) {
    currentFilter = s;
    document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('f-' + s).classList.add('active');
    renderTripleView();
}
document.getElementById('globalSearch').addEventListener('input', renderTripleView);

function renderDiagnostics() {
    document.getElementById('diag-container').innerHTML = `
        <div class="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-3xl text-center">
            <h3 class="text-emerald-400 font-bold text-lg mb-2">Processamento Concluído</h3>
            <p class="text-sm opacity-60">As duas planilhas foram relacionadas com sucesso.</p>
        </div>`;
}

function exportResult() {
    const ws = XLSX.utils.json_to_sheet(auditResult.map(i => ({ Aluno: i.dataA.ALUNO, BaseA: i.dataA.SITUACAO_MATRICULA, BaseB: i.dataB.STATUS, Resultado: i.status })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "Relatorio_Auditoria.xlsx");
}
