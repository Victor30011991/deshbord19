let storage = [];
let auditedData = [];
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    
    // QA: Força o redimensionamento para evitar gráficos quebrados
    setTimeout(() => {
        Object.values(charts).forEach(chart => chart.resize());
    }, 50);
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Erro: São necessários 2 arquivos para o cruzamento.");
    
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

    const fk = (row, kws) => Object.keys(row).find(k => kws.some(kw => k.toUpperCase().includes(kw.toUpperCase())));
    
    const cIdB = fk(base[0], ["ALUNO", "NOME", "MATRICULA", "ID"]);
    const cStB = fk(base[0], ["STATUS", "SITUACAO", "RESULTADO"]);
    const cIdC = fk(comp[0], ["ALUNO", "NOME", "MATRICULA", "ID"]);
    const cStC = fk(comp[0], ["STATUS", "SITUACAO", "RESULTADO"]);
    const cCid = fk(base[0], ["CIDADE", "MUNICIPIO", "LOCAL"]);

    auditedData = base.map(row => {
        const idB = String(row[cIdB] || "").toLowerCase().trim();
        const stB = String(row[cStB] || "").trim();
        const match = comp.find(r => String(r[cIdC] || "").toLowerCase().trim() === idB);
        
        let res = "ausente";
        if (match) {
            res = (stB.toLowerCase() === String(match[cStC]).toLowerCase().trim()) ? "identico" : "divergente";
        }
        return { ...row, _audit: res, _stOrig: stB };
    });

    updateDashboard(cCid);
}

function updateDashboard(cCid) {
    const d = auditedData.filter(r => r._audit === 'divergente').length;
    const e = auditedData.filter(r => r._audit === 'identico').length;
    const m = auditedData.filter(r => r._audit === 'ausente').length;
    const t = auditedData.length;

    document.getElementById('kpiRows').innerText = t;
    document.getElementById('kpiDiffs').innerText = d;
    document.getElementById('kpiEquals').innerText = e;
    document.getElementById('kpiAccuracy').innerText = ((e/t)*100).toFixed(1) + "%";

    // QA: Garantir que o contexto do canvas existe antes de renderizar
    drawChart('chartStatus', 'doughnut', [d, e, m], ['#f59e0b', '#10b981', '#334155'], ['Divergente', 'Conforme', 'Ausente']);
    
    const cityMap = auditedData.reduce((a, r) => { const c = r[cCid] || "N/A"; a[c] = (a[c] || 0) + 1; return a; }, {});
    const topCid = Object.entries(cityMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    drawChart('chartCities', 'bar', topCid.map(c => c[1]), '#3b82f6', topCid.map(c => c[0]), 'y');

    const sitMap = auditedData.reduce((a, r) => { const s = r._stOrig || "Outros"; a[s] = (a[s] || 0) + 1; return a; }, {});
    const topSit = Object.entries(sitMap).sort((a,b) => b[1] - a[1]).slice(0, 6);
    drawChart('chartSituations', 'line', topSit.map(s => s[1]), '#8b5cf6', topSit.map(s => s[0]));

    renderTable();
    genReport(t, d, e);
}

function drawChart(id, type, data, color, labels, axis = 'x') {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) charts[id].destroy();
    
    charts[id] = new Chart(el.getContext('2d'), {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: Array.isArray(color) ? color : color + '33',
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
            plugins: { legend: { display: type === 'doughnut', position: 'bottom', labels: { color: '#64748b', font: { size: 10 } } } },
            scales: type !== 'doughnut' ? {
                x: { ticks: { color: '#475569' }, grid: { display: false } },
                y: { ticks: { color: '#475569' }, grid: { color: 'rgba(255,255,255,0.03)' } }
            } : {}
        }
    });
}

function renderTable() {
    const mode = document.getElementById('viewFilter').value;
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th class="px-4 py-3">${k}</th>`).join('')}</tr>`;
    
    const filtered = auditedData.filter(r => mode === 'all' ? true : (mode === 'diff' ? r._audit === 'divergente' : r._audit === 'identico'));
    document.getElementById('tableBody').innerHTML = filtered.slice(0, 150).map(r => `
        <tr class="border-b border-white/5 ${r._audit === 'divergente' ? 'bg-orange-500/10 text-orange-500' : (r._audit === 'identico' ? 'text-emerald-500' : '')}">
            ${keys.map(k => `<td class="px-4 py-3">${r[k] || ''}</td>`).join('')}
        </tr>
    `).join('');
}

function genReport(t, d, e) {
    document.getElementById('aiTxt').innerHTML = `
        <h2 class="text-xl font-bold text-white mb-6 uppercase tracking-widest">Parecer Técnico</h2>
        <div class="space-y-4 text-slate-300">
            <p>O motor de análise processou <strong>${t} registros</strong> em tempo real.</p>
            <div class="p-6 bg-black/30 rounded-2xl border-l-4 border-blue-500">
                A conformidade atual é de <strong>${((e/t)*100).toFixed(1)}%</strong>. Foram detectadas <strong>${d} inconsistências</strong> de status que requerem saneamento imediato.
            </div>
            <p class="text-xs italic text-slate-500">Recomendação: Exportar o relatório de divergências (Excel) e realizar a retificação manual nas cidades com maior volume de erros identificadas no dashboard.</p>
        </div>
    `;
}
