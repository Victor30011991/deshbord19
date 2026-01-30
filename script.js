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
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    if (storage.length > 0) {
        processAudit();
        generateAiReport(); // Dispara automático
    }
});

async function parseFile(file) {
    return new Promise(resolve => {
        if (file.name.endsWith('.csv')) {
            // Tenta identificar o separador (vírgula ou ponto e vírgula)
            Papa.parse(file, { 
                header: true, 
                skipEmptyLines: true,
                complete: res => resolve(res.data) 
            });
        } else {
            const reader = new FileReader();
            reader.onload = e => {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
            };
            reader.readAsBinaryString(file);
        }
    });
}

// O segredo da "Extração Sem Comando": Busca por palavras-chave nos nomes das colunas
function findCol(row, keywords) {
    const keys = Object.keys(row || {});
    return keys.find(k => keywords.some(kw => k.toUpperCase().includes(kw))) || null;
}

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1]?.rows || null;
    let dCount = 0;

    // Detecta automaticamente quem é o aluno e quem é o status nos seus arquivos
    const colId = findCol(base[0], ["ALUNO", "NOME", "CD_ALUNO", "NOME_ALUNO"]);
    const colStatus = findCol(base[0], ["STATUS", "SITUACAO", "SITUACAO_MATRICULA"]);
    const colCidade = findCol(base[0], ["CIDADE", "MUNICIPIO", "MUNICIPIO_ACAO"]);

    auditedData = base.map(row => {
        let isDiff = false;
        if (comp) {
            const nomeBase = String(row[colId] || "").trim().toLowerCase();
            const match = comp.find(r => String(r[findCol(comp[0], ["ALUNO", "NOME"])] || "").trim().toLowerCase() === nomeBase);
            
            if (!match) isDiff = true; // Aluno não encontrado no outro arquivo
            else {
                const s1 = String(row[colStatus] || "").trim();
                const s2 = String(match[findCol(comp[0], ["STATUS", "SITUACAO"])] || "").trim();
                if (s1 !== s2) isDiff = true; // Status mudou
            }
        }
        if (isDiff) dCount++;
        return { ...row, _isDiff: isDiff };
    });

    // Atualiza Painéis
    document.getElementById('kpiRows').innerText = auditedData.length;
    document.getElementById('kpiDiffs').innerText = dCount;
    document.getElementById('kpiEquals').innerText = auditedData.length - dCount;

    renderChart('chartStatus', 'doughnut', [dCount, auditedData.length - dCount], ['#f59e0b', '#10b981'], ['Diferente', 'Igual']);
    
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
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    applyFilters();
}

function applyFilters() {
    const mode = document.getElementById('viewFilter').value;
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    const filtered = auditedData.filter(r => mode === 'all' ? true : r._isDiff);
    document.getElementById('tableBody').innerHTML = filtered.slice(0, 250).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k] || ''}</td>`).join('')}</tr>
    `).join('');
}

async function generateAiReport() {
    const key = document.getElementById('geminiKey').value;
    const aiTxt = document.getElementById('aiTxt');
    if (!key) return aiTxt.innerHTML = "<i>Análise IA silenciada (Chave não informada). Os gráficos e tabelas acima já mostram os erros para correção.</i>";

    document.getElementById('aiLoader').classList.remove('hidden');
    aiTxt.innerHTML = "Extraindo informações cruzadas...";

    const resumo = `Total: ${auditedData.length}, Erros: ${auditedData.filter(r => r._isDiff).length}`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: "Gere um parecer de auditoria sobre: " + resumo }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>');
    } catch (e) { aiTxt.innerHTML = "IA Offline."; }
    finally { document.getElementById('aiLoader').classList.add('hidden'); }
}

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "Auditoria_BI.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 6 } });
    doc.save("Relatorio_Auditoria.pdf");
}
