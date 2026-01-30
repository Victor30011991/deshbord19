let storage = [];
let auditedData = [];
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const mapping = {'tab-charts': 'btn-charts', 'tab-table': 'btn-table', 'tab-ai': 'btn-ai-tab'};
    if (document.getElementById(mapping[id])) document.getElementById(mapping[id]).classList.add('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Por favor, selecione 2 arquivos para realizar a comparação.");
    
    storage = [];
    document.getElementById('loader').classList.remove('hidden');

    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }

    processAudit();
    generateAutomaticReport();
    document.getElementById('loader').classList.add('hidden');
});

async function parseFile(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: res => resolve(res.data) });
        } else {
            reader.onload = e => {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
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

    // Detecção automática de colunas críticas
    const colIdBase = findCol(base[0], ["ALUNO", "NOME", "MATRICULA", "ID", "CODIGO"]);
    const colStatusBase = findCol(base[0], ["STATUS", "SITUACAO", "RESULTADO", "MATRICULA_SITUACAO"]);
    const colIdComp = findCol(comp[0], ["ALUNO", "NOME", "MATRICULA", "ID", "CODIGO"]);
    const colStatusComp = findCol(comp[0], ["STATUS", "SITUACAO", "RESULTADO", "MATRICULA_SITUACAO"]);
    const colCidade = findCol(base[0], ["CIDADE", "MUNICIPIO", "LOCAL"]);

    auditedData = base.map(row => {
        const valBase = String(row[colIdBase] || "").trim().toLowerCase();
        const statusBase = String(row[colStatusBase] || "").trim().toLowerCase();
        
        // Busca o correspondente no segundo arquivo
        const match = comp.find(r => String(r[colIdComp] || "").trim().toLowerCase() === valBase);
        
        let statusAudit = "nao_encontrado";
        if (match) {
            const statusComp = String(match[colStatusComp] || "").trim().toLowerCase();
            statusAudit = (statusBase === statusComp) ? "identico" : "divergente";
        }

        return { ...row, _statusAudit: statusAudit };
    });

    updateDashboard(colCidade);
}

function updateDashboard(colCidade) {
    const diffs = auditedData.filter(r => r._statusAudit === 'divergente').length;
    const equals = auditedData.filter(r => r._statusAudit === 'identico').length;
    const missing = auditedData.filter(r => r._statusAudit === 'nao_encontrado').length;

    document.getElementById('kpiRows').innerText = auditedData.length;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiEquals').innerText = equals;
    document.getElementById('kpiMissing').innerText = missing;

    renderChart('chartStatus', 'doughnut', [diffs, equals, missing], ['#f59e0b', '#10b981', '#475569'], ['Divergente', 'Idêntico', 'Ausente']);
    
    const cityData = auditedData.reduce((acc, r) => { 
        const c = r[colCidade] || "Não Informado"; 
        acc[c] = (acc[c] || 0) + 1; 
        return acc; 
    }, {});
    
    const topCities = Object.entries(cityData).sort((a,b) => b[1] - a[1]).slice(0, 5);
    renderChart('chartCities', 'bar', topCities.map(c => c[1]), ['#3b82f6'], topCities.map(c => c[0]));

    renderTable();
}

function renderChart(id, type, data, colors, labels) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 9 } } } } 
        }
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

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 500).map(r => `
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
    const missing = auditedData.filter(r => r._statusAudit === 'nao_encontrado').length;
    const perc = ((equals / total) * 100).toFixed(1);

    aiTxt.innerHTML = `
        <div class="space-y-4">
            <h3 class="text-white font-bold text-lg">Resumo Executivo</h3>
            <p>Análise realizada entre as bases carregadas. O sistema identificou <b>${total} registros</b> processáveis.</p>
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-black/20 p-3 rounded border border-white/5">
                    <p class="text-[10px] uppercase">Conformidade</p>
                    <p class="text-emerald-500 font-bold">${perc}% da base</p>
                </div>
                <div class="bg-black/20 p-3 rounded border border-white/5">
                    <p class="text-[10px] uppercase">Divergências</p>
                    <p class="text-orange-500 font-bold">${diffs} registros</p>
                </div>
            </div>
            <p><b>Observações Técnicas:</b><br>
            - Identificamos <b>${missing}</b> nomes que constam no arquivo principal mas não foram localizados na base de comparação.<br>
            - As divergências encontradas referem-se estritamente à coluna de Situação/Status.</p>
            <p class="text-xs italic text-slate-500">Relatório gerado automaticamente pelo motor de cruzamento BI.Enterprise AI.</p>
        </div>
    `;
}

function exportExcel() {
    const exportData = auditedData.map(r => {
        const { _statusAudit, ...rest } = r;
        return { ...rest, RESULTADO_AUDITORIA: _statusAudit.toUpperCase() };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "Auditoria_Total.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Relatório de Auditoria Automatizada", 14, 15);
    doc.autoTable({ 
        html: '#mainTable', 
        startY: 25, 
        theme: 'grid', 
        styles: { fontSize: 7 },
        headStyles: { fillColor: [15, 23, 42] }
    });
    doc.save("Relatorio_BI.pdf");
}
