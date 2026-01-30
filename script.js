let rawA = [], rawB = [], audited = [];
let charts = {};
let currentFilter = 'todos';
let searchTerm = '';

// Navegação Inteligente
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    
    if (id === 'tab-dash') {
        setTimeout(updateDashboard, 50); // Garante que o canvas existe antes de desenhar
    }
}

// Carregamento de Arquivos
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Selecione os dois arquivos juntos.");

    // Feedback visual de carregamento
    document.getElementById('diag-container').innerHTML = '<div class="text-blue-500 animate-pulse font-bold">Processando 13k registros...</div>';

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

// Motor de Cruzamento de Alta Performance (O(n))
function processAudit() {
    // Cria um mapa da Base B para busca instantânea por primeiro nome
    const indexB = new Map();
    rawB.forEach(row => {
        const nome = String(row.ALUNO || row.NOME || "").split(' ')[0].toUpperCase();
        if (nome) indexB.set(nome, row);
    });

    audited = rawA.map(rowA => {
        const nomeCompletoA = String(rowA.NOME_ALUNO || rowA.ALUNO || "").toUpperCase().trim();
        const primeiroNomeA = nomeCompletoA.split(' ')[0];
        
        const matchB = indexB.get(primeiroNomeA);
        
        let result = 'ausente';
        if (matchB) {
            const statusA = String(rowA.SITUACAO_MATRICULA || "").trim().toUpperCase();
            const statusB = String(matchB.STATUS || matchB.SITUACAO || "").trim().toUpperCase();
            
            // Lógica de equivalência de status
            result = (statusA === statusB || (statusA.includes("ANDAMENTO") && statusB.includes("MATRICULADO"))) 
                     ? 'relacionado' : 'divergente';
        }

        return { 
            dataA: rowA, 
            dataB: matchB || {}, 
            status: result,
            searchKey: (nomeCompletoA + " " + (rowA.CPF || "")).toUpperCase()
        };
    });
    
    renderTripleTable();
    updateDashboard();
    switchTab('tab-conf');
}

// Renderização Otimizada (Virtual List)
function renderTripleTable() {
    const data = audited.filter(r => {
        const matchesFilter = currentFilter === 'todos' || r.status === currentFilter;
        const matchesSearch = searchTerm === '' || r.searchKey.includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    const display = data.slice(0, 100); // Mostra apenas 100 para manter o site leve

    const htmlA = display.map(r => `<tr><td class="font-bold text-white">${r.dataA.NOME_ALUNO || r.dataA.ALUNO}</td><td>${r.dataA.SITUACAO_MATRICULA || '---'}</td></tr>`).join('');
    const htmlB = display.map(r => `<tr><td class="text-slate-400">${r.dataB.ALUNO || r.dataB.NOME || '---'}</td><td>${r.dataB.STATUS || '---'}</td></tr>`).join('');
    const htmlRes = display.map(r => `<tr><td><span class="badge ${r.status === 'relacionado' ? 'bg-emerald-500/20 text-emerald-400' : r.status === 'divergente' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'}">${r.status}</span></td></tr>`).join('');

    document.getElementById('tableA').innerHTML = `<thead><tr><th>Aluno (Base A)</th><th>Status</th></tr></thead><tbody>${htmlA}</tbody>`;
    document.getElementById('tableB').innerHTML = `<thead><tr><th>Aluno (Base B)</th><th>Status</th></tr></thead><tbody>${htmlB}</tbody>`;
    document.getElementById('tableRes').innerHTML = `<thead><tr><th>Veredito</th></tr></thead><tbody>${htmlRes}</tbody>`;
}

// Busca Instantânea
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
        <div class="bg-[#0f172a] p-4 rounded-xl border border-white/5">
            <span class="text-[9px] uppercase font-bold opacity-40 block mb-1">Total Analisado</span>
            <h2 class="text-2xl font-black text-white">${stats.total.toLocaleString()}</h2>
        </div>
        <div class="bg-[#0f172a] p-4 rounded-xl border border-white/5">
            <span class="text-[9px] uppercase font-bold opacity-40 block mb-1 text-emerald-400">Em Conformidade</span>
            <h2 class="text-2xl font-black text-emerald-400">${stats.rel.toLocaleString()}</h2>
        </div>
        <div class="bg-[#0f172a] p-4 rounded-xl border border-white/5">
            <span class="text-[9px] uppercase font-bold opacity-40 block mb-1 text-orange-400">Divergências</span>
            <h2 class="text-2xl font-black text-orange-400">${stats.div.toLocaleString()}</h2>
        </div>
        <div class="bg-[#0f172a] p-4 rounded-xl border border-white/5">
            <span class="text-[9px] uppercase font-bold opacity-40 block mb-1">Sem Vínculo</span>
            <h2 class="text-2xl font-black text-slate-500">${stats.aus.toLocaleString()}</h2>
        </div>
    `;

    // Gráfico de Pizza
    const ctx = document.getElementById('chartStatus').getContext('2d');
    if (charts.status) charts.status.destroy();
    charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Divergentes', 'Relacionados', 'Ausentes'],
            datasets: [{ data: [stats.div, stats.rel, stats.aus], backgroundColor: ['#f59e0b', '#10b981', '#1e293b'], borderWidth: 0 }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 10 } } } } }
    });
}
