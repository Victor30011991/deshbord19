/* BI ENTERPRISE AI - MOTOR DE AUDITORIA V3.0
   Engenharia de Dados: Detecção Automática e Cruzamento em Escala
*/

let storage = [];
let auditedData = [];
let charts = {};

// 1. GESTÃO DE NAVEGAÇÃO (ABAS)
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    
    // Forçar redimensionamento dos gráficos ao trocar de aba para evitar bugs visuais
    setTimeout(() => {
        Object.values(charts).forEach(c => c.resize());
    }, 100);
}

// 2. MOTOR DE CARREGAMENTO (PROCESSAMENTO DE FICHEIROS)
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) {
        alert("⚠️ Por favor, selecione os dois ficheiros (Produção e Loja) simultaneamente.");
        return;
    }

    storage = [];
    document.getElementById('diag-details').innerHTML = '<p class="text-blue-400 animate-pulse font-bold">A processar dados em larga escala...</p>';
    document.getElementById('diag-status').classList.remove('hidden');

    try {
        for (let f of files) {
            const data = await parseFile(f);
            storage.push({ name: f.name, rows: data });
        }
        processAudit();
    } catch (err) {
        alert("Erro no processamento: " + err);
    }
});

// Detecção Automática de Delimitador e Formato (Essencial para os seus CSVs)
async function parseFile(file) {
    return new Promise((resolve, reject) => {
        const isExcel = file.name.match(/\.(xlsx|xls)$/i);
        
        if (isExcel) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const ab = e.target.result;
                const wb = XLSX.read(ab, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Tratamento especializado para CSV com detecção de ";" ou ","
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "ISO-8859-1", // Melhora a leitura de caracteres especiais (acentos)
                complete: (results) => resolve(results.data),
                error: (err) => reject(err)
            });
        }
    });
}

// 3. INTELIGÊNCIA DE AUDITORIA (CRUZAMENTO DE DADOS)
function processAudit() {
    if (storage.length < 2) return;

    const base = storage[0].rows; // Base Produção
    const comp = storage[1].rows; // Base Loja

    // Mapeamento Dinâmico de Colunas (Procura nomes similares nos seus ficheiros)
    const fk = (row, kws) => Object.keys(row).find(k => kws.some(kw => k.toUpperCase().includes(kw)));
    
    const cIdB = fk(base[0], ["CPF_ALUNO", "CD_ALUNO", "MATRICULA"]);
    const cNmB = fk(base[0], ["NOME_ALUNO", "ALUNO"]);
    const cStB = fk(base[0], ["SITUACAO_MATRICULA", "STATUS"]);
    const cMun = fk(base[0], ["MUNICIPIO_ACAO", "CIDADE"]);

    const cNmC = fk(comp[0], ["ALUNO", "NOME"]);
    const cStC = fk(comp[0], ["STATUS", "SITUACAO"]);

    // Normalização para evitar erros de espaço ou maiúsculas (Ex: Fabio Rhennan)
    const norm = (txt) => String(txt || "").toUpperCase().trim();

    auditedData = base.map(row => {
        const nomeB = norm(row[cNmB]);
        const statusB = norm(row[cStB]);
        
        // Procura correspondência na segunda base
        const match = comp.find(r => norm(r[cNmC]).includes(nomeB.split(' ')[0]) && nomeB.length > 3);
        
        let resultado = "ausente";
        if (match) {
            const statusC = norm(match[cStC]);
            // Lógica Semântica: Se "Em Andamento" e "Matriculado" forem equivalentes
            const equivalentes = (statusB.includes("ANDAMENTO") && statusC.includes("MATRICULADO")) || 
                                 (statusB.includes("CONCLU") && statusC.includes("APROVADO")) ||
                                 (statusB === statusC);
            
            resultado = equivalentes ? "relacionado" : "divergente";
        }

        return { 
            ...row, 
            _audit: resultado, 
            _cidade: row[cMun] || "Outros",
            _statusOrig: statusB 
        };
    });

    renderDiagnostics(base.length, comp.length);
    updateDashboard();
    renderAcertos(cNmB);
}

// 4. INTERFACE E DASHBOARDS
function renderDiagnostics(t1, t2) {
    const diag = document.getElementById('diag-details');
    diag.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                <p class="text-[10px] font-bold opacity-50 uppercase">Base Produção</p>
                <p class="text-xl font-bold text-white">${t1.toLocaleString()} Linhas</p>
            </div>
            <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                <p class="text-[10px] font-bold opacity-50 uppercase">Base Loja Nacional</p>
                <p class="text-xl font-bold text-white">${t2.toLocaleString()} Linhas</p>
            </div>
        </div>
        <p class="mt-4 text-emerald-400 text-xs">✓ Mapeamento de colunas concluído com sucesso.</p>
    `;
}

function renderAcertos(col) {
    const container = document.getElementById('acerto-container');
    const pendentes = auditedData.filter(r => r._audit === 'ausente').slice(0, 10);
    
    if (pendentes.length === 0) {
        container.innerHTML = '<p class="text-center py-20 opacity-30">Nenhuma inconsistência de identidade detectada.</p>';
        return;
    }

    container.innerHTML = pendentes.map(r => `
        <div class="bg-[#0f172a] p-6 rounded-2xl flex justify-between items-center border border-white/5 hover:border-blue-500/30 transition-all">
            <div>
                <span class="text-[9px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-bold mb-2 inline-block">VÍNCULO NÃO ENCONTRADO</span>
                <h4 class="text-white font-bold">${r[col]}</h4>
                <p class="text-[10px] opacity-50">${r._cidade}</p>
            </div>
            <button onclick="this.innerText='VINCULADO'; this.classList.add('bg-emerald-500/20','text-emerald-500')" class="bg-blue-600/10 text-blue-500 px-6 py-2 rounded-xl text-[10px] font-bold hover:bg-blue-600 hover:text-white transition-all">CONFIRMAR VÍNCULO</button>
        </div>
    `).join('');
    
    document.getElementById('acerto-count').innerText = auditedData.filter(r => r._audit === 'ausente').length + " Pendências";
}

function updateDashboard() {
    const total = auditedData.length;
    const div = auditedData.filter(r => r._audit === 'divergente').length;
    const rel = auditedData.filter(r => r._audit === 'relacionado').length;
    const aus = total - (div + rel);

    document.getElementById('kpi-total').innerText = total.toLocaleString();
    document.getElementById('kpi-conf').innerText = ((rel/total)*100).toFixed(1) + "%";
    document.getElementById('kpi-div').innerText = div.toLocaleString();
    document.getElementById('kpi-manual').innerText = aus.toLocaleString();

    // Gráfico de Status
    drawChart('chartStatus', 'doughnut', [div, rel, aus], ['#f59e0b', '#10b981', '#334155'], ['Divergente', 'Relacionado', 'Ausente']);

    // Gráfico de Cidades
    const cityMap = auditedData.reduce((a, r) => { a[r._cidade] = (a[r._cidade] || 0) + 1; return a; }, {});
    const topCities = Object.entries(cityMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    drawChart('chartCities', 'bar', topCities.map(c => c[1]), '#3b82f6', topCities.map(c => c[0]), 'y');

    renderParecer(total, div, rel);
}

function drawChart(id, type, data, colors, labels, axis = 'x') {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    
    charts[id] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 5
            }]
        },
        options: {
            indexAxis: axis,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: type === 'doughnut', position: 'bottom', labels: { color: '#64748b', font: { size: 10 } } } },
            scales: type === 'bar' ? {
                x: { grid: { display: false }, ticks: { color: '#64748b' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
            } : {}
        }
    });
}

function renderParecer(t, d, r) {
    const conf = ((r/t)*100).toFixed(1);
    document.getElementById('rel-content').innerHTML = `
        <div class="text-center mb-10">
            <h2 class="text-3xl font-black text-white tracking-tighter">PARECER TÉCNICO DE AUDITORIA</h2>
            <p class="text-blue-500 font-bold text-xs tracking-widest uppercase mt-2">Relatório Gerado Automaticamente</p>
        </div>
        <div class="grid grid-cols-2 gap-8 mb-10">
            <div class="bg-white/5 p-6 rounded-3xl">
                <p class="text-[10px] font-bold opacity-50 uppercase mb-2">Conformidade Geral</p>
                <p class="text-4xl font-black text-emerald-400">${conf}%</p>
            </div>
            <div class="bg-white/5 p-6 rounded-3xl">
                <p class="text-[10px] font-bold opacity-50 uppercase mb-2">Divergências Críticas</p>
                <p class="text-4xl font-black text-orange-500">${d}</p>
            </div>
        </div>
        <div class="space-y-4 text-slate-400 text-sm leading-relaxed">
            <p>Após o cruzamento de dados entre a <strong>Produção Consolidada</strong> e a <strong>Loja Nacional</strong>, o motor de IA detectou que ${r} registos estão em total conformidade.</p>
            <p class="p-4 bg-black/20 rounded-xl border border-white/5">⚠️ Foram identificadas ${d} divergências de status. Recomenda-se a verificação imediata das unidades de topo no gráfico de municípios.</p>
        </div>
    `;
}

// 5. EXPORTAÇÃO
function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("BI Enterprise AI - Relatório de Auditoria", 10, 10);
    // Adicionar lógica de autotable aqui se necessário
    doc.save("Auditoria_BI.pdf");
}
