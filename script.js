let storage = [];
let auditedData = [];
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const mapping = {'tab-charts': 'btn-charts', 'tab-table': 'btn-table', 'tab-ai': 'btn-ai-tab'};
    document.getElementById(mapping[id]).classList.add('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Por favor, selecione 2 arquivos para comparar.");
    
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    processAudit();
    generateAutomaticReport();
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

function findCol(row, keywords) {
    if (!row) return null;
    return Object.keys(row).find(k => keywords.some(kw => k.toUpperCase().includes(kw.toUpperCase()))) || null;
}

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1].rows;

    const colIdBase = findCol(base[0], ["ALUNO", "NOME", "MATRICULA", "ID"]);
    const colStatusBase = findCol(base[0], ["STATUS", "SITUACAO", "RESULTADO"]);
    const colIdComp = findCol(comp[0], ["ALUNO", "NOME", "MATRICULA", "ID"]);
    const colStatusComp = findCol(comp[0], ["STATUS", "SITUACAO", "RESULTADO"]);
    const colCidade = findCol(base[0], ["CIDADE", "MUNICIPIO"]);

    auditedData = base.map(row => {
        const valBase = String(row[colIdBase] || "").trim().toLowerCase();
        const statusBase = String(row[colStatusBase] || "").trim().toLowerCase();
        const match = comp.find(r => String(r[colIdComp] || "").trim().toLowerCase() === valBase);
        
        let statusAudit = "nao_encontrado";
        if (match) {
            const statusComp = String(match[colStatusComp] || "").trim().toLowerCase();
            statusAudit = (statusBase === statusComp) ? "identico" : "divergente";
        }
        return { ...row, _statusAudit: statusAudit };
    });

    updateUI(colCidade);
}

function updateUI(colCidade) {
    const diffs = auditedData.filter(r => r._statusAudit === 'divergente').length;
    const equals = auditedData.filter(r => r._statusAudit === 'identico').length;

    document.getElementById('kpiRows').innerText = auditedData.length;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiEquals').innerText = equals;

    renderChart('chartStatus', 'doughnut', [diffs, equals], ['#f59e0b', '#10b981'], ['Divergente', 'Identico']);
    
    const cityData = auditedData.reduce((acc, r) => { const c = r[colCidade] || "N/A"; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const topCities = Object.entries(cityData).sort((a,b) => b[1] - a[1]).slice(0, 5);
    renderChart('chartCities', 'bar', topCities.map(c => c[1]), ['#3b82f6'], topCities.map(c => c[0]));

    renderTable();
}

function renderChart(id, type, data, colors, labels) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 9 } } } } }
    });
}

function renderTable() {
    const mode = document.getElementById('viewFilter').value;
    const keys = Object.keys(auditedData[0] || {}).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    
    const filtered = auditedData.filter(r => {
        if (mode === 'all') return true;
        if (mode === 'diff') return r._statusAudit === 'divergente';
        if (mode === 'equal') return r._statusAudit === 'identico';
        return true;
    });

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 300).map(r => `
        <tr class="${r._statusAudit === 'divergente' ? 'diff-row' : ''} ${r._statusAudit === 'identico' ? 'equal-row' : ''}">
            ${keys.map(k => `<td>${r[k] || ''}</td>`).join('')}
        </tr>
    `).join('');
}

function generateAutomaticReport() {
    const aiTxt = document.getElementById('aiTxt');
    const total = auditedData.length;
    const diffs = auditedData.filter(r => r._statusAudit === 'divergente').length;
    const equals = auditedData.filter(r => r._statusAudit === 'identico').length;
    const perc = ((equals/total)*100).toFixed(1);

    aiTxt.innerHTML = `
        <div class='space-y-4'>
            <h3 class='text-white font-bold'>Análise de Integridade de Dados</h3>
            <p>Concluímos o cruzamento entre <b>${storage[0].name}</b> e <b>${storage[1].name}</b>.</p>
            <p>O sistema detectou que <b>${perc}%</b> dos dados estão em total conformidade (Idênticos). Entretanto, foram localizadas <b>${diffs} divergências</b> que necessitam de conferência manual.</p>
            <p><b>Ação recomendada:</b> Acesse a aba 'Dados & Filtros' e selecione 'Apenas Divergências' para exportar a lista de correção.</p>
        </div>
    `;
}

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Auditoria_Resultado.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 6 } });
    doc.save("Relatorio_Auditoria.pdf");
}
