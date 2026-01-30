let storage = [];
let auditedData = [];
let charts = {};
let currentFilter = 'todos';

// Sistema de Navegação
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    
    // Atualizar gráficos ao trocar para aba Dashboard
    if (id === 'tab-dash' && charts.status) {
        setTimeout(() => {
            charts.status.resize();
            charts.cities.resize();
        }, 50);
    }
}

// Carregamento de Arquivos com Detecção de Delimitador
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("⚠️ Selecione os dois arquivos simultaneamente.");

    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    processAudit();
});

async function parseFile(file) {
    return new Promise(resolve => {
        const isExcel = file.name.match(/\.(xlsx|xls)$/i);
        if (isExcel) {
            const reader = new FileReader();
            reader.onload = e => {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
            };
            reader.readAsArrayBuffer(file);
        } else {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "ISO-8859-1",
                complete: r => resolve(r.data)
            });
        }
    });
}

// Inteligência de Auditoria
function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1].rows;

    const fk = (row, kws) => Object.keys(row).find(k => kws.some(kw => k.toUpperCase().includes(kw)));
    
    const cIdB = fk(base[0], ["CPF", "MATRICULA"]) || Object.keys(base[0])[0];
    const cNmB = fk(base[0], ["NOME", "ALUNO"]);
    const cStB = fk(base[0], ["SITUACAO", "STATUS"]);
    const cMun = fk(base[0], ["MUNICIPIO", "CIDADE"]) || "CIDADE";

    const cNmC = fk(comp[0], ["ALUNO", "NOME"]);
    const cStC = fk(comp[0], ["STATUS", "SITUACAO"]);

    auditedData = base.map(row => {
        const nomeB = String(row[cNmB] || "").toUpperCase().trim();
        const statusB = String(row[cStB] || "").toUpperCase().trim();
        
        // Busca inteligente (Similaridade simples)
        const match = comp.find(r => {
            const nomeC = String(r[cNmC] || "").toUpperCase();
            return nomeC.includes(nomeB.split(' ')[0]) && nomeB.length > 5;
        });
        
        let result = "ausente";
        if (match) {
            const statusC = String(match[cStC] || "").toUpperCase();
            const isEquiv = (statusB.includes("ANDAMENTO") && statusC.includes("MATRICULADO")) || (statusB === statusC);
            result = isEquiv ? "relacionado" : "divergente";
        }

        return { 
            ...row, 
            _audit: result, 
            _cidade: row[cMun] || "OUTROS", 
            _nome: nomeB, 
            _status: statusB,
            _doc: row[cIdB]
        };
    });

    renderDiagnostics();
    renderAcertos();
    renderTable();
    updateDashboard();
    renderParecer();
}

// Lógica da Planilha e Filtros
function filterTable(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('f-' + type.substring(0,3)).classList.add('active');
    renderTable();
}

function renderTable() {
    const head = document.getElementById('table-head');
    const body = document.getElementById('table-body');
    const filtered = auditedData.filter(r => currentFilter === 'todos' || r._audit === currentFilter);

    head.innerHTML = `<th>Documento/ID</th><th>Aluno</th><th>Status Base</th><th>Veredito</th>`;
    body.innerHTML = filtered.slice(0, 1000).map(r => `
        <tr class="hover:bg-white/[0.02] transition-colors">
            <td class="opacity-50">${r._doc || '---'}</td>
            <td class="font-bold text-white">${r._nome}</td>
            <td>${r._status}</td>
            <td>
                <span class="px-2 py-1 rounded text-[9px] font-black uppercase ${
                    r._audit === 'relacionado' ? 'bg-emerald-500/20 text-emerald-400' : 
                    r._audit === 'divergente' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-300'
                }">${r._audit}</span>
            </td>
        </tr>
    `).join('');
}

function searchTable() {
    const val = document.getElementById('tableSearch').value.toUpperCase();
    const rows = document.getElementById('table-body').getElementsByTagName('tr');
    for (let r of rows) { r.style.display = r.innerText.toUpperCase().includes(val) ? "" : "none"; }
}

// Dashboard e Relatórios
function updateDashboard() {
    const t = auditedData.length;
    const d = auditedData.filter(r => r._audit === 'divergente').length;
    const r = auditedData.filter(r => r._audit === 'relacionado').length;
    const a = t - (d + r);

    document.getElementById('kpi-total').innerText = t.toLocaleString();
    document.getElementById('kpi-conf').innerText = ((r/t)*100).toFixed(1) + "%";
    document.getElementById('kpi-div').innerText = d.toLocaleString();
    document.getElementById('kpi-aus').innerText = a.toLocaleString();

    initChart('chartStatus', 'doughnut', [d, r, a], ['#f59e0b', '#10b981', '#475569'], ['Divergentes', 'Relacionados', 'Ausentes']);
    
    const cityMap = auditedData.reduce((a, r) => { a[r._cidade] = (a[r._cidade] || 0) + 1; return a; }, {});
    const topCities = Object.entries(cityMap).sort((a,b) => b[1] - a[1]).slice(0, 8);
    initChart('chartCities', 'bar', topCities.map(c => c[1]), '#3b82f6', topCities.map(c => c[0]));
}

function initChart(id, type, data, colors, labels) {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderRadius: 5 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 10 } } } } }
    });
}

function renderParecer() {
    const t = auditedData.length;
    const d = auditedData.filter(r => r._audit === 'divergente').length;
    document.getElementById('rel-content').innerHTML = `
        <h2 class="text-3xl font-black text-white mb-8 text-center tracking-tighter">PARECER TÉCNICO</h2>
        <div class="space-y-6 text-slate-400 text-lg">
            <p>Auditoria finalizada para <strong>${t.toLocaleString()} registros</strong>.</p>
            <div class="p-6 bg-orange-500/10 border-l-4 border-orange-500 rounded-xl">
                <p class="text-orange-400 font-bold">Atenção: ${d} divergências detectadas.</p>
            </div>
            <p class="text-sm">Os dados detalhados estão disponíveis na aba de <strong>Conferência</strong>.</p>
        </div>
    `;
}

function renderDiagnostics() {
    document.getElementById('diag-container').innerHTML = `
        <div class="bg-emerald-500/10 border border-emerald-500/20 p-12 rounded-[40px] text-center">
            <div class="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500 text-2xl">✓</div>
            <h3 class="text-white text-xl font-bold mb-2">Processamento Concluído</h3>
            <p class="text-slate-500 text-sm">Dados mapeados com sucesso. Verifique as abas de análise.</p>
        </div>
    `;
}

function renderAcertos() {
    const aus = auditedData.filter(r => r._audit === 'ausente').slice(0, 8);
    document.getElementById('acerto-list').innerHTML = aus.map(r => `
        <div class="bg-white/5 p-5 rounded-2xl flex justify-between items-center border border-white/5 hover:border-blue-500/30 transition-all">
            <span class="text-white font-bold text-sm">${r._nome}</span>
            <button class="bg-blue-600/10 text-blue-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all">Vincular</button>
        </div>
    `).join('');
    document.getElementById('acerto-count').innerText = auditedData.filter(r => r._audit === 'ausente').length + " Pendências";
}
