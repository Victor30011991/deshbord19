let storage = [];
let auditedData = [];
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const mapping = {'tab-charts': 'btn-charts', 'tab-table': 'btn-table', 'tab-ai': 'btn-ai-tab'};
    document.getElementById(mapping[id]).classList.add('active');
    
    // IMPORTANTE: Redesenha os gráficos ao mudar de aba para evitar o erro visual
    if(id === 'tab-charts') Object.values(charts).forEach(c => c.resize());
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Selecione 2 arquivos.");
    
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    processAudit();
});

async function parseFile(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: res => resolve(res.data) });
        } else {
            reader.onload = e => {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
            };
            reader.readAsArrayBuffer(file);
        }
    });
}

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1].rows;

    const findKey = (row, kws) => Object.keys(row).find(k => kws.some(kw => k.toUpperCase().includes(kw.toUpperCase())));
    
    const colIdB = findKey(base[0], ["ALUNO", "NOME", "MATRICULA", "ID"]);
    const colStB = findKey(base[0], ["STATUS", "SITUACAO", "RESULTADO"]);
    const colIdC = findKey(comp[0], ["ALUNO", "NOME", "MATRICULA", "ID"]);
    const colStC = findKey(comp[0], ["STATUS", "SITUACAO", "RESULTADO"]);
    const colCid = findKey(base[0], ["CIDADE", "MUNICIPIO"]);

    auditedData = base.map(row => {
        const valB = String(row[colIdB] || "").toLowerCase().trim();
        const stB = String(row[colStB] || "").trim();
        const match = comp.find(r => String(r[colIdC] || "").toLowerCase().trim() === valB);
        
        let audit = "ausente";
        if (match) audit = (stB.toLowerCase() === String(match[colStC]).toLowerCase().trim()) ? "identico" : "divergente";
        
        return { ...row, _audit: audit, _stOrig: stB };
    });

    updateDashboard(colCid);
}

function updateDashboard(colCid) {
    const diffs = auditedData.filter(r => r._audit === 'divergente').length;
    const equals = auditedData.filter(r => r._audit === 'identico').length;
    const miss = auditedData.filter(r => r._audit === 'ausente').length;
    const total = auditedData.length;

    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiEquals').innerText = equals;
    document.getElementById('kpiAccuracy').innerText = ((equals / total) * 100).toFixed(1) + "%";

    // Gráfico de Status (Doughnut)
    renderChart('chartStatus', 'doughnut', [diffs, equals, miss], ['#f59e0b', '#10b981', '#334155'], ['Divergente', 'Conforme', 'Ausente']);

    // Gráfico de Cidades (Barra Horizontal)
    const cityMap = auditedData.reduce((a, r) => { const c = r[colCid] || "N/A"; a[c] = (a[c] || 0) + 1; return a; }, {});
    const topCid = Object.entries(cityMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    renderChart('chartCities', 'bar', topCid.map(c => c[1]), '#3b82f6', topCid.map(c => c[0]), 'y');

    // Gráfico de Área (Linha/Tendência de Situações)
    const sitMap = auditedData.reduce((a, r) => { const s = r._stOrig || "Outros"; a[s] = (a[s] || 0) + 1; return a; }, {});
    const topSit = Object.entries(sitMap).sort((a,b) => b[1] - a[1]).slice(0, 6);
    renderChart('chartSituations', 'line', topSit.map(s => s[1]), '#8b5cf6', topSit.map(s => s[0]));

    renderTable();
    generateInsights(total, diffs, equals);
}

function renderChart(id, type, data, color, labels, axis = 'x') {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    
    charts[id] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: Array.isArray(color) ? color : color + '44',
                borderColor: Array.isArray(color) ? 'transparent' : color,
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            indexAxis: axis,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: type === 'doughnut', position: 'bottom', labels: { color: '#94a3b8', font: { size: 9 } } } },
            scales: type !== 'doughnut' ? {
                x: { grid: { display: false }, ticks: { color: '#64748b' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
            } : {}
        }
    });
}

function renderTable() {
    const mode = document.getElementById('viewFilter').value;
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = keys.map(k => `<th class="px-4 py-3">${k}</th>`).join('');
    
    const filtered = auditedData.filter(r => mode === 'all' ? true : (mode === 'diff' ? r._audit === 'divergente' : r._audit === 'identico'));
    document.getElementById('tableBody').innerHTML = filtered.slice(0, 100).map(r => `
        <tr class="border-b border-white/5 ${r._audit === 'divergente' ? 'bg-orange-500/10 text-orange-500' : (r._audit === 'identico' ? 'text-emerald-500' : '')}">
            ${keys.map(k => `<td class="px-4 py-3">${r[k] || ''}</td>`).join('')}
        </tr>
    `).join('');
}

function generateInsights(total, diffs, equals) {
    document.getElementById('aiTxt').innerHTML = `
        <h2 class="text-xl font-bold text-white mb-4">Análise Geral</h2>
        <p class="mb-4">Identificamos <b>${total}</b> registros totais. A conformidade está em <b>${((equals/total)*100).toFixed(1)}%</b>.</p>
        <div class="p-4 bg-orange-500/10 border-l-4 border-orange-500 rounded text-orange-200">
            Existem <b>${diffs}</b> divergências críticas que devem ser revisadas para garantir a integridade dos dados acadêmicos.
        </div>
    `;
}
