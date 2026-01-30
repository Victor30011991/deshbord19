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
    if (files.length === 0) return;
    
    storage = [];
    for (let f of files) {
        try {
            const data = await parseFile(f);
            storage.push({ name: f.name, rows: data });
        } catch (err) {
            console.error("Erro ao ler arquivo:", f.name);
        }
    }

    if (storage.length >= 2) {
        processAudit();
        generateAiReport();
    } else {
        alert("Para auditoria cruzada, carregue pelo menos 2 arquivos.");
    }
});

async function parseFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, { 
                header: true, 
                skipEmptyLines: true,
                complete: res => resolve(res.data),
                error: err => reject(err)
            });
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
    const keys = Object.keys(row);
    return keys.find(k => keywords.some(kw => k.toUpperCase().includes(kw.toUpperCase()))) || null;
}

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1].rows;
    let dCount = 0;

    const colIdBase = findCol(base[0], ["ALUNO", "NOME", "CD_ALUNO", "NOME_ALUNO"]);
    const colStatusBase = findCol(base[0], ["STATUS", "SITUACAO", "SITUACAO_MATRICULA"]);
    const colCidadeBase = findCol(base[0], ["CIDADE", "MUNICIPIO"]);

    const colIdComp = findCol(comp[0], ["ALUNO", "NOME", "CD_ALUNO"]);
    const colStatusComp = findCol(comp[0], ["STATUS", "SITUACAO"]);

    auditedData = base.map(row => {
        let isDiff = false;
        const idValue = String(row[colIdBase] || "").trim().toLowerCase();
        
        const match = comp.find(r => String(r[colIdComp] || "").trim().toLowerCase() === idValue);
        
        if (!match) {
            isDiff = true; // Não encontrado no segundo arquivo
        } else {
            const s1 = String(row[colStatusBase] || "").trim();
            const s2 = String(match[colStatusComp] || "").trim();
            if (s1 !== s2) isDiff = true; // Status diferente
        }

        if (isDiff) dCount++;
        return { ...row, _isDiff: isDiff };
    });

    updateUI(dCount, colCidadeBase);
}

function updateUI(dCount, colCidade) {
    document.getElementById('kpiRows').innerText = auditedData.length;
    document.getElementById('kpiDiffs').innerText = dCount;
    document.getElementById('kpiEquals').innerText = auditedData.length - dCount;

    renderChart('chartStatus', 'doughnut', [dCount, auditedData.length - dCount], ['#f59e0b', '#10b981'], ['Divergente', 'Ok']);
    
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
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } 
        }
    });
}

function renderTable() {
    const firstRow = auditedData[0] || {};
    const keys = Object.keys(firstRow).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    applyFilters();
}

function applyFilters() {
    const mode = document.getElementById('viewFilter').value;
    const firstRow = auditedData[0] || {};
    const keys = Object.keys(firstRow).filter(k => !k.startsWith('_'));
    const filtered = auditedData.filter(r => mode === 'all' ? true : r._isDiff);
    
    document.getElementById('tableBody').innerHTML = filtered.slice(0, 500).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">
            ${keys.map(k => `<td>${r[k] !== undefined ? r[k] : ''}</td>`).join('')}
        </tr>
    `).join('');
}

async function generateAiReport() {
    const key = document.getElementById('geminiKey').value;
    const aiTxt = document.getElementById('aiTxt');
    if (!key) {
        aiTxt.innerHTML = "<i>Análise IA desativada. Insira a Chave Gemini no topo para obter um parecer técnico.</i>";
        return;
    }

    document.getElementById('aiLoader').classList.remove('hidden');
    aiTxt.innerHTML = "Cruzando dados e gerando insights...";

    const resumo = {
        total: auditedData.length,
        erros: auditedData.filter(r => r._isDiff).length,
        amostra: auditedData.filter(r => r._isDiff).slice(0, 3)
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Aja como um auditor de dados profissional. Analise este resumo de BI: ${JSON.stringify(resumo)}. Escreva um parecer curto e objetivo sobre a saúde desses dados e o que deve ser corrigido prioritariamente. Use HTML simples para formatar (<b>, <br>).` }] }]
            })
        });
        const data = await response.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text;
    } catch (e) {
        aiTxt.innerHTML = "Erro ao conectar com a IA. Verifique sua chave.";
    } finally {
        document.getElementById('aiLoader').classList.add('hidden');
    }
}

function exportExcel() {
    const exportData = auditedData.map(r => {
        const { _isDiff, ...rest } = r;
        return { ...rest, STATUS_AUDITORIA: _isDiff ? 'DIVERGENTE' : 'OK' };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, "Auditoria_Enterprise_AI.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Relatório de Auditoria BI Enterprise AI", 14, 15);
    doc.autoTable({ 
        html: '#mainTable', 
        startY: 20,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59] }
    });
    doc.save("Auditoria.pdf");
}
